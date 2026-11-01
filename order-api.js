import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app=express();
const allowedOrigin=process.env.APP_ORIGIN;
if(!allowedOrigin)throw new Error('APP_ORIGIN must be set to the public shop origin.');
app.use(helmet({contentSecurityPolicy:{directives:{"default-src":["'none'"],"connect-src":["'self'","https://api.telegram.org"],"img-src":["'none'"],"object-src":["'none'"],"frame-ancestors":["'none'"]}}}));
app.use(cors({origin:allowedOrigin,methods:['POST','GET','OPTIONS'],allowedHeaders:['Content-Type']}));
app.use(express.json({limit:'20kb'}));
const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const catalog={
 'Royal Shield':100,
 'Mobility Staff':200,
 'Power Ring':400,
 'Royal Silver Bar':350,
 'Menorah Pendant Necklace':215,
 'Amber Glass Candle':130
};
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
   return res.status(400).json({error:'Bitte Name, gültige E-Mail, Bestellnummer und Warenkorb prüfen.'});
  }
  const items=[];
  for(const item of rawItems){
   const product=clean(item?.name,100),quantity=Number(item?.quantity);
   if(!Object.hasOwn(catalog,product)||!Number.isInteger(quantity)||quantity<1||quantity>25){
    return res.status(400).json({error:'Ungültiges Produkt oder ungültige Menge im Warenkorb.'});
   }
   items.push({name:product,quantity,unitPrice:catalog[product],lineTotal:catalog[product]*quantity});
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   return res.status(503).json({error:'Telegram noch nicht eingerichtet: TELEGRAM_BOT_TOKEN und TELEGRAM_ADMIN_CHAT_ID müssen im Render-Backend gesetzt sein.'});
  }
  const total=items.reduce((sum,item)=>sum+item.lineTotal,0);
  const message=[
   'Neue Shop-Bestellanfrage',
   'Bestellnummer: '+orderNumber,
   'Name: '+name,
   'E-Mail: '+email,
   '',
   ...items.map(item=>item.name+' × '+item.quantity+' — $'+item.lineTotal.toFixed(2)),
   '',
   'Warenwert: $'+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen. Zahlung, Verfügbarkeit und Versandkosten sind NICHT bestätigt.'
  ].join('\\n');
  const response=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:message,disable_web_page_preview:true})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.ok!==true){
   console.error('Telegram send failed:',result.description||response.status);
   return res.status(502).json({error:'Telegram konnte die Bestellnachricht nicht annehmen.'});
  }
  res.status(201).json({ok:true,orderNumber,total});
 }catch(error){
  console.error('Shop order error:',error.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>console.log('ROTHSHILD order API listening on '+port));
