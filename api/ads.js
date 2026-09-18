const {json,cors}=require('./_shared');

module.exports=async(req,res)=>{
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed.'});

  const enabled=String(process.env.CHROMETRY_ADS_ENABLED||'true').toLowerCase()==='true';
  if(!enabled) return json(res,204,{});

  const url=process.env.CHROMETRY_AD_URL||'';
  const title=process.env.CHROMETRY_AD_TITLE||'';
  const description=process.env.CHROMETRY_AD_DESCRIPTION||'';
  const sponsor=process.env.CHROMETRY_AD_SPONSOR||'';
  const image=process.env.CHROMETRY_AD_IMAGE_URL||'';

  if(!url||!title) return json(res,204,{});
  return json(res,200,{url,title,description,sponsor,image:image||null});
};