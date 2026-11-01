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

// Telegram product menu: send /start to the configured bot to display product buttons.
// Set TELEGRAM_WEBHOOK_SECRET and configure Telegram's webhook to POST /api/telegram/webhook.
const botCatalog=[
 {id:'shield',name:'Royal Shield',price:100},
 {id:'staff',name:'Mobility Staff',price:200},
 {id:'ring',name:'Power Ring',price:400},
 {id:'silver',name:'Royal Silver Bar',price:350},
 {id:'pendant',name:'Menorah Pendant Necklace',price:215},
 {id:'candle',name:'Amber Glass Candle',price:130}
];
const botSessions=new Map();
const botKey=id=>botCatalog.find(p=>p.id===id);
async function telegram(method,payload){
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)throw new Error('TELEGRAM_BOT_TOKEN fehlt');
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok||j.ok!==true)throw new Error(j.description||'Telegram API Fehler');
 return j.result;
}
function menuKeyboard(){
 return {inline_keyboard:[
  ...botCatalog.map(p=>[{text:p.name+' · 
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
+p.price,callback_data:'add:'+p.id}]),
  [{text:'🛒 Warenkorb ansehen',callback_data:'cart'}]
 ]};
}
function cartKeyboard(cart){
 const rows=botCatalog.filter(p=>(cart[p.id]||0)>0).map(p=>[{text:'− '+p.name,callback_data:'dec:'+p.id},{text:String(cart[p.id])+' ×',callback_data:'noop'},{text:'+ '+p.name,callback_data:'add:'+p.id}]);
 rows.push([{text:'Weiter zur Bestellübersicht',callback_data:'checkout'}],[{text:'Produkte',callback_data:'menu'}]);
 return {inline_keyboard:rows};
}
function cartText(cart){
 const rows=botCatalog.filter(p=>(cart[p.id]||0)>0);
 if(!rows.length)return 'Dein Warenkorb ist leer. Wähle ein Produkt:';
 const total=rows.reduce((sum,p)=>sum+p.price*cart[p.id],0);
 return '🛒 Warenkorb\n'+rows.map(p=>p.name+' × '+cart[p.id]+' — 
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
+(p.price*cart[p.id]).toFixed(2)).join('\n')+'\n\nWarenwert: 
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
+total.toFixed(2)+'\nNoch keine Zahlung bestätigt.';
}
app.post('/api/telegram/webhook',async(req,res)=>{
 try{
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
  if(secret&&req.get('x-telegram-bot-api-secret-token')!==secret)return res.sendStatus(403);
  const update=req.body||{};
  if(update.message?.text==='/start'){
   const chatId=update.message.chat.id;
   botSessions.set(String(chatId),{cart:{}});
   await telegram('sendMessage',{chat_id:chatId,text:'Willkommen! Wähle Produkte für deinen Warenkorb. Preise und Verfügbarkeit werden vor Zahlung bestätigt.',reply_markup:menuKeyboard()});
  }else if(update.callback_query){
   const cb=update.callback_query,chatId=cb.message.chat.id,key=String(chatId);
   const session=botSessions.get(key)||{cart:{}},data=String(cb.data||'');
   if(data.startsWith('add:')){const p=botKey(data.slice(4));if(p)session.cart[p.id]=Math.min(25,(session.cart[p.id]||0)+1);}
   else if(data.startsWith('dec:')){const id=data.slice(4);session.cart[id]=Math.max(0,(session.cart[id]||0)-1);}
   botSessions.set(key,session);
   if(data==='noop'){await telegram('answerCallbackQuery',{callback_query_id:cb.id});return res.sendStatus(200);}
   if(data==='menu'){await telegram('editMessageText',{chat_id:chatId,message_id:cb.message.message_id,text:'Wähle Produkte:',reply_markup:menuKeyboard()});}
   else if(data==='cart'||data.startsWith('add:')||data.startsWith('dec:')){await telegram('editMessageText',{chat_id:chatId,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data==='checkout'){
    const lines=botCatalog.filter(p=>(session.cart[p.id]||0)>0);
    if(!lines.length)await telegram('answerCallbackQuery',{callback_query_id:cb.id,text:'Dein Warenkorb ist leer.'});
    else {
     const total=lines.reduce((sum,p)=>sum+p.price*session.cart[p.id],0);
     const summary='Bestellübersicht\n'+lines.map(p=>p.name+' × '+session.cart[p.id]+' — 
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
+(p.price*session.cart[p.id]).toFixed(2)).join('\n')+'\nWarenwert: 
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
+total.toFixed(2)+'\n\nBitte sende Name und E-Mail als nächste Nachricht. Die Bestellung wird erst nach Prüfung verbindlich.';
     session.stage='customer';session.lastSummary=summary;botSessions.set(key,session);
     await telegram('sendMessage',{chat_id:chatId,text:summary});
    }
   }
   await telegram('answerCallbackQuery',{callback_query_id:cb.id});
  }else if(update.message?.text&&botSessions.get(String(update.message.chat.id))?.stage==='customer'){
   const chatId=update.message.chat.id,session=botSessions.get(String(chatId));
   const customer=clean(update.message.text,250);
   const lines=botCatalog.filter(p=>(session.cart[p.id]||0)>0);
   const total=lines.reduce((sum,p)=>sum+p.price*session.cart[p.id],0);
   const orderId='TG-'+Date.now();
   const adminText='Telegram Bestellanfrage\nBestellnummer: '+orderId+'\nKunde: '+customer+'\nKunden-Chat: '+chatId+'\n'+session.lastSummary+'\nStatus: Zahlung nicht bestätigt.';
   if(process.env.TELEGRAM_ADMIN_CHAT_ID)await telegram('sendMessage',{chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:adminText,reply_markup:{inline_keyboard:[[{text:'TXID prüfen / Zahlung bestätigen',callback_data:'admincheck:'+orderId}]]}});
   await telegram('sendMessage',{chat_id:chatId,text:'Bestellanfrage '+orderId+' wurde weitergeleitet. Bitte TXID erst nach einer offiziellen Zahlungsaufforderung senden. Zahlung ist noch nicht bestätigt.'});
   session.stage='';botSessions.set(String(chatId),session);
  }
  res.sendStatus(200);
 }catch(e){console.error('Telegram webhook error:',e.message);res.sendStatus(200);}
});

app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100);
  const email=clean(req.body?.customerEmail,254).toLowerCase();
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^RO-[0-9]{8}-[A-F0-9]{6}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
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
