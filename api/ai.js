const OpenAI=require('openai');
const {json,cors,bearer,activeSubscription}=require('./_shared');

const PROMPT=`You are Chrometry Pro Vision, a visual reverse-engineering assistant for game-art and realtime rendering developers. Analyze the attached screenshot as a practical recreation problem for Three.js.

Use the image as the source of truth for visible content. Never claim to know proprietary shaders, textures, engine settings or exact LUTs from one screenshot. Clearly separate observation from inference.

Return ONLY valid JSON:
{
 "content_type":"game_screenshot|app_ui|photo|illustration|3d_render|webpage|other",
 "is_game":true,
 "game":"Known title or Unknown",
 "confidence":0,
 "scene":"short scene description",
 "visual_style":"short rendering/color-style description",
 "lighting":{"sun_hex":"#RRGGBB or null","sky_fill_hex":"#RRGGBB or null","ambient_hex":"#RRGGBB or null","shadow_tint_hex":"#RRGGBB or null","sun_intensity":1.8,"ambient_intensity":0.7,"hemisphere_intensity":1.0,"exposure":1.0,"time_of_day":"unknown","direction":"unknown","analysis":"short practical explanation"},
 "capture_artifacts":[{"name":"HUD/browser edge/etc","region":{"x":0,"y":0,"w":0,"h":0},"confidence":0}],
 "elements":[{"name":"grass","category":"vegetation","region":{"x":0,"y":0,"w":0,"h":0},"confidence":0,"base_hex":"#RRGGBB","lit_hex":"#RRGGBB","shadow_hex":"#RRGGBB","color_source":"texture_dominant|lighting_dominant|mixed|unknown","color_source_confidence":0,"material":"","texture_detail":"","recreation":"specific practical Three.js guidance","threejs":{"roughness":0.9,"metalness":0,"opacity":1,"emissive_intensity":0}}],
 "recreation_notes":["practical notes"]
}
Rules: return 6-14 useful visible elements; do not fabricate absent objects; regions are normalized 0..1; identify a game only when visually defensible; separate HUD/capture artifacts; explain texture-vs-light contribution; give actionable approximate lighting/exposure values. If a title is recognized, use web search only for public technical references and do not present speculation as fact.`;

function parseJSON(text){const s=String(text||'').replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\`\`\`\s*$/i,'').trim();try{return JSON.parse(s);}catch{}const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1));}catch{}}return {raw_text:s};}

module.exports=async(req,res)=>{cors(res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});try{const {active}=await activeSubscription(bearer(req));if(!active)return json(res,402,{error:'An active Chrometry Pro subscription is required for Pro AI.'});const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};const image=String(body.image||'');if(!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(image))return json(res,400,{error:'Invalid image payload.'});if(image.length>12000000)return json(res,413,{error:'Image is too large. Please use a smaller screenshot.'});if(!process.env.OPENAI_API_KEY)return json(res,500,{error:'OPENAI_API_KEY is not configured.'});const palette=Array.isArray(body.palette)?body.palette.slice(0,24):[];const paletteText=palette.map(p=>`${p.hex} (${Number(p.coverage||0).toFixed(1)}%)`).join(', ')||'none';const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',store:false,input:[{role:'user',content:[{type:'input_text',text:`${PROMPT}\n\nMeasured local palette: ${paletteText}`},{type:'input_image',image_url:image,detail:'high'}]}],tools:[{type:'web_search'}]});return json(res,200,{analysis:parseJSON(response.output_text),model:process.env.OPENAI_MODEL||'gpt-5.6-luna'});}catch(e){console.error(e);return json(res,500,{error:e.message||'Pro AI request failed.'});}};
