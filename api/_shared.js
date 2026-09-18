const crypto=require('crypto');
const Stripe=require('stripe');

function json(res,status,body){res.status(status).setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.status(status).json(body);}
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
function stripe(){if(!process.env.STRIPE_SECRET_KEY)throw new Error('STRIPE_SECRET_KEY is not configured.');return new Stripe(process.env.STRIPE_SECRET_KEY);}
function sign(payload){const secret=process.env.CHROMETRY_LICENSE_SECRET;if(!secret)throw new Error('CHROMETRY_LICENSE_SECRET is not configured.');const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return body+'.'+sig;}
function verifySignedToken(token,allowExpired=false){if(!token||typeof token!=='string'||!token.includes('.'))throw new Error('Missing Pro license.');const [body,sig]=token.split('.');const secret=process.env.CHROMETRY_LICENSE_SECRET;if(!secret)throw new Error('CHROMETRY_LICENSE_SECRET is not configured.');const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error('Invalid Pro license.');const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!p.sub||!p.customer||!p.exp||(!allowExpired&&p.exp<Math.floor(Date.now()/1000)))throw new Error('Expired Pro license.');return p;}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):'';}
async function activeSubscription(token,allowExpired=false){const payload=verifySignedToken(token,allowExpired);const subscription=await stripe().subscriptions.retrieve(payload.sub);const active=['active','trialing'].includes(subscription.status);return {payload,subscription,active};}
module.exports={json,cors,stripe,sign,verifySignedToken,bearer,activeSubscription};
