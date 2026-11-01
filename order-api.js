import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import crypto from 'node:crypto';

const app=express();
const {Pool}=pg;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;
const origin=process.env.APP_ORIGIN;
if(!origin) throw new Error('APP_ORIGIN must be configured.');
if(!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
if(!process.env.TELEGRAM_ADMIN_CHAT_ID) throw new Error('TELEGRAM_ADMIN_CHAT_ID is missing.');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{"default-src":["'none'"],"connect-src":["'self'"],"img-src":["'self'","data:"],"style-src":["'self'","'unsafe-inline'"],"object-src":["'none'"],"frame-ancestors":["'none'"]}}}));
app.use(cors({origin,methods:['GET','POST'],allowedHeaders:['Content-Type','X-Telegram-Bot-Api-Secret-Token']}));
app.use(express.json({limit:'30kb'}));
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const catalog=[
 {id:'shield',name:'Royal Shield',price:100},
 {id:'staff',name:'Mobility Staff',price:200},
 {id:'ring',name:'Power Ring',price:400},
 {id:'silver',name:'Royal Silver Bar',price:350},
 {id:'pendant',name:'Menorah Pendant Necklace',price:215},
 {id:'candle',name:'Amber Glass Candle',price:130}
];
const sessions=new Map();
const states=new Map();
const money=n=>'$'+Number(n).toFixed(2);
const orderId=()=> 'RO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
const orderTable=`CREATE TABLE IF NOT EXISTS shop_orders(
 order_number text PRIMARY KEY, customer_name text NOT NULL, customer_email text,
 telegram_chat_id text, items jsonb NOT NULL, total numeric(12,2) NOT NULL,
 txid text, status text NOT NULL DEFAULT 'awaiting_txid',
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
)`;
async function init(){if(pool)await pool.query(orderTable);}
async function tg(method,payload){
 const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.ok!==true)throw new Error(data.description||'Telegram API failed');
 return data.result;
}
const productKeyboard=()=>({inline_keyboard:[...catalog.map(p=>[{text:p.name+' · '+money(p.price),callback_data:'add:'+p.id}]),[{text:'🛒 Warenkorb',callback_data:'cart'}]]});
function cartKeyboard(cart){const rows=catalog.filter(p=>cart[p.id]).map(p=>[{text:'− '+p.name,callback_data:'dec:'+p.id},{text:String(cart[p.id])+'×',callback_data:'noop'},{text:'+ '+p.name,callback_data:'add:'+p.id}]);rows.push([{text:'Zur Kasse',callback_data:'checkout'}],[{text:'Produkte',callback_data:'menu'}]);return {inline_keyboard:rows};}
function cartRows(cart){return catalog.filter(p=>cart[p.id]).map(p=>({...p,quantity:cart[p.id],lineTotal:p.price*cart[p.id]}));}
function cartText(cart){const rows=cartRows(cart);if(!rows.length)return 'Der Warenkorb ist leer. Wähle Produkte:';return '🛒 Warenkorb\n'+rows.map(p=>p.name+' × '+p.quantity+' — '+money(p.lineTotal)).join('\n')+'\n\nGesamt: '+money(rows.reduce((a,p)=>a+p.lineTotal,0));}
async function saveOrder(order){if(!pool)throw new Error('DATABASE_URL muss gesetzt sein, damit Bestellungen dauerhaft gespeichert werden.');await pool.query('INSERT INTO shop_orders(order_number,customer_name,customer_email,telegram_chat_id,items,total,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[order.id,order.name,order.email||null,order.chatId||null,JSON.stringify(order.items),order.total,order.status||'awaiting_txid']);}
async function getOrder(id){if(!pool)return null;const r=await pool.query('SELECT * FROM shop_orders WHERE order_number=$1',[id]);return r.rows[0]||null;}
async function adminOrder(order){const lines=order.items.map(i=>i.name+' × '+i.quantity+' — '+money(i.lineTotal)).join('\n');return tg('sendMessage',{chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:'🛍 Neue Bestellung\n'+order.id+'\nKunde: '+order.name+'\nE-Mail: '+(order.email||'nicht angegeben')+'\n\n'+lines+'\n\nGesamt: '+money(order.total)+'\nStatus: TXID/Zahlung offen.',reply_markup:{inline_keyboard:[[{text:'TXID prüfen / Zahlung bestätigen',callback_data:'review:'+order.id}]]}});}
app.get('/api/health',(req,res)=>res.json({ok:true,storage:pool?'postgres':'unavailable'}));
app.post('/api/telegram/webhook',async(req,res)=>{
 try{
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
  if(secret&&req.get('x-telegram-bot-api-secret-token')!==secret)return res.sendStatus(403);
  const update=req.body||{};
  const msg=update.message,cb=update.callback_query;
  if(msg?.text){
   const chat=String(msg.chat.id),text=clean(msg.text,1000);
   let session=sessions.get(chat)||{cart:{}};
   if(text==='/start'||text==='/menu'){sessions.set(chat,{cart:{}});await tg('sendMessage',{chat_id:msg.chat.id,text:'Willkommen im Shop. Wähle Produkte; der endgültige Preis und die Zahlung werden separat bestätigt.',reply_markup:productKeyboard()});}
   else if(states.get(chat)==='name'){
    if(text.length<2){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib einen vollständigen Namen ein.'});}
    else {session.name=text;states.set(chat,'email');sessions.set(chat,session);await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte sende deine E-Mail-Adresse (oder „-“, falls du keine angeben möchtest).'});}
   }else if(states.get(chat)==='email'){
    const email=text==='-'?'':text.toLowerCase();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){await tg('sendMessage',{chat_id:msg.chat.id,text:'Die E-Mail sieht ungültig aus. Bitte erneut eingeben oder „-“ senden.'});}
    else {
     const rows=cartRows(session.cart),total=rows.reduce((a,p)=>a+p.lineTotal,0),id=orderId();
     const order={id,name:session.name,email,chatId:chat,items:rows,total,status:'awaiting_txid'};
     await saveOrder(order);await adminOrder(order);
     states.set(chat,'txid:'+id);sessions.set(chat,session);
     await tg('sendMessage',{chat_id:msg.chat.id,text:'Bestellung '+id+' wurde übermittelt. Gesamt: '+money(total)+'. Bitte warte auf die offizielle Zahlungsanweisung. Sende anschließend die Transaktions-ID (TXID) als Nachricht. Die Zahlung ist noch NICHT bestätigt.'});
    }
   }else if(states.get(chat)?.startsWith('txid:')){
    const id=states.get(chat).slice(5);
    if(text.length<8){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte sende eine vollständige TXID.'});}
    else {
     await pool.query('UPDATE shop_orders SET txid=$1,status=$2 WHERE order_number=$3 AND telegram_chat_id=$4',[text,'txid_submitted',id,chat]);
     const order=await getOrder(id);
     await tg('sendMessage',{chat_id:msg.chat.id,text:'TXID für '+id+' wurde an die Administration zur Prüfung übermittelt. Zahlung ist bis zur Bestätigung weiterhin offen.'});
     await tg('sendMessage',{chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:'🔎 TXID eingegangen\nBestellung: '+id+'\nTXID: '+text+'\nBitte unabhängig prüfen.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+id},{text:'Ablehnen',callback_data:'reject:'+id}]]}});
    }
   }else {await tg('sendMessage',{chat_id:msg.chat.id,text:'Nutze /start, um den Shop zu öffnen.'});}
  }else if(cb){
   const chat=String(cb.message.chat.id),data=String(cb.data||'');let session=sessions.get(chat)||{cart:{}};
   if(data.startsWith('add:')){const p=catalog.find(p=>p.id===data.slice(4));if(p)session.cart[p.id]=Math.min(25,(session.cart[p.id]||0)+1);sessions.set(chat,session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data.startsWith('dec:')){const id=data.slice(4);session.cart[id]=Math.max(0,(session.cart[id]||0)-1);sessions.set(chat,session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data==='menu')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:'Wähle Produkte:',reply_markup:productKeyboard()});
   else if(data==='cart')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});
   else if(data==='noop'){}
   else if(data==='checkout'){if(!cartRows(session.cart).length)await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Warenkorb ist leer.'});else{states.set(chat,'name');await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Bitte gib deinen vollständigen Namen ein, um die Bestellung anzulegen.'});}}
   else if(data.startsWith('paid:')||data.startsWith('reject:')){
    if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID)){await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});}
    else {const id=data.slice(data.indexOf(':')+1),paid=data.startsWith('paid:');await pool.query('UPDATE shop_orders SET status=$1,paid_at=CASE WHEN $2 THEN now() ELSE paid_at END WHERE order_number=$3',[paid?'paid':'payment_rejected',paid,id]);const order=await getOrder(id);if(order?.telegram_chat_id)await tg('sendMessage',{chat_id:order.telegram_chat_id,text:paid?'Zahlung für '+id+' wurde durch die Administration bestätigt. Rechnung: '+origin+'/api/shop/invoice/'+id: 'Zahlung für '+id+' wurde nicht bestätigt. Bitte kontaktiere den Support.'});await tg('answerCallbackQuery',{callback_query_id:cb.id,text:paid?'Zahlung bestätigt':'Abgelehnt'});}
   }
   else if(data.startsWith('review:')){if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID))await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});else{const order=await getOrder(data.slice(7));await tg('sendMessage',{chat_id:cb.message.chat.id,text:order?'Bestellung '+order.order_number+'\nStatus: '+order.status+'\nTXID: '+(order.txid||'noch keine'):'Bestellung nicht gefunden.'});}}
   await tg('answerCallbackQuery',{callback_query_id:cb.id});
  }
  res.sendStatus(200);
 }catch(e){console.error('Telegram webhook error:',e.message);res.sendStatus(200);}
});
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100),email=clean(req.body?.customerEmail,254).toLowerCase(),raw=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||raw.length<1||raw.length>20)return res.status(400).json({error:'Name, gültige E-Mail und Warenkorb erforderlich.'});
  const items=[];for(const item of raw){const p=catalog.find(p=>p.name===clean(item.name,100)),qty=Number(item.quantity);if(!p||!Number.isInteger(qty)||qty<1||qty>25)return res.status(400).json({error:'Ungültiges Produkt oder Menge.'});items.push({...p,quantity:qty,lineTotal:p.price*qty});}
  const total=items.reduce((s,i)=>s+i.lineTotal,0),id=orderId(),order={id,name,email,chatId:null,items,total,status:'awaiting_txid'};
  await saveOrder(order);await adminOrder(order);res.status(201).json({ok:true,orderNumber:id,total,status:order.status,txidUrl:origin+'/api/shop/txid/'+id});
 }catch(e){console.error('Web order failed:',e.message);res.status(500).json({error:'Bestellung konnte nicht gespeichert oder übermittelt werden.'});}
});
app.post('/api/shop/txid/:id',async(req,res)=>{
 const txid=clean(req.body?.txid,300);if(txid.length<8)return res.status(400).json({error:'TXID ist zu kurz.'});
 try{const r=await pool.query("UPDATE shop_orders SET txid=$1,status='txid_submitted' WHERE order_number=$2 AND status IN ('awaiting_txid','txid_submitted') RETURNING *",[txid,clean(req.params.id,40)]);if(!r.rowCount)return res.status(404).json({error:'Bestellung nicht gefunden oder bereits abgeschlossen.'});const o=r.rows[0];await tg('sendMessage',{chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:'TXID für Webbestellung '+o.order_number+'\nKunde: '+o.customer_name+' ('+o.customer_email+')\nTXID: '+txid+'\nGesamt: '+money(o.total)+'\nBitte manuell prüfen.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+o.order_number},{text:'Ablehnen',callback_data:'reject:'+o.order_number}]]}});res.json({ok:true,status:'txid_submitted'});}catch(e){console.error(e.message);res.status(500).json({error:'TXID konnte nicht gespeichert werden.'});}
});
app.get('/api/shop/invoice/:id',async(req,res)=>{try{const o=await getOrder(clean(req.params.id,40));if(!o||o.status!=='paid')return res.status(404).send('Rechnung erst nach bestätigter Zahlung verfügbar.');const lines=o.items.map(i=>'<tr><td>'+escapeHtml(i.name)+'</td><td>'+i.quantity+'</td><td>'+money(i.lineTotal)+'</td></tr>').join('');res.type('html').send('<!doctype html><html lang="de"><meta charset="utf-8"><title>Rechnung '+o.order_number+'</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px;color:#222}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ccc;text-align:left}.actions{margin:20px 0}@media print{.actions{display:none}}</style><h1>Rechnung</h1><p>ROTHSHILD · Order of Light</p><p>Rechnungsnummer: '+o.order_number+'<br>Kunde: '+escapeHtml(o.customer_name)+'<br>Datum: '+new Date(o.paid_at).toLocaleDateString('de-DE')+'</p><table><thead><tr><th>Artikel</th><th>Menge</th><th>Betrag</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Gesamt: '+money(o.total)+'</h2><p>Zahlungsstatus: bezahlt</p><div class="actions"><button onclick="window.print()">Drucken / Als PDF speichern</button></div></html>');}catch(e){res.status(500).send('Rechnung konnte nicht geladen werden.');}});
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const port=Number(process.env.PORT||3000);
await init();
app.listen(port,'0.0.0.0',()=>console.log('ROTHSHILD Telegram order API listening on '+port));
