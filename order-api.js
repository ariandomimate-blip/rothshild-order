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
const origin=process.env.APP_ORIGIN||'https://the-house-of-rothshild-illuminati.onrender.com';
const adminChatTarget=()=>process.env.TELEGRAM_ADMIN_USER_ID||process.env.TELEGRAM_ADMIN_CHAT_ID;
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{"default-src":["'none'"],"connect-src":["'self'"],"img-src":["'self'","data:"],"style-src":["'self'","'unsafe-inline'"],"object-src":["'none'"],"frame-ancestors":["'none'"]}}}));
app.use(cors({origin,methods:['GET','POST'],allowedHeaders:['Content-Type','X-Telegram-Bot-Api-Secret-Token']}));
app.use(express.json({limit:'30kb'}));
app.get('/',(req,res)=>res.redirect(302,'https://the-house-of-rothshild-illuminati.onrender.com/'));
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const catalog=[
 {id:'shield',name:'Royal Shield',price:100},
 {id:'staff',name:'Mobility Staff',price:200},
 {id:'ring',name:'Power Ring',price:400},
 {id:'silver',name:'Royal Silver Bar',price:350},
 {id:'pendant',name:'Menorah Pendant Necklace',price:215},
 {id:'candle',name:'Amber Glass Candle',price:130}
];
const memorySessions=new Map();
const getSession=async chat=>{if(!pool)return memorySessions.get(String(chat))||{chat_id:String(chat),state:'cart',cart:{},customer_name:null,customer_email:null,customer_address:null,customer_postal_city:null,pending_order:null,application_data:{}};const r=await pool.query('SELECT * FROM telegram_shop_sessions WHERE chat_id=$1',[chat]);return r.rows[0]||{chat_id:chat,state:'cart',cart:{},customer_name:null,customer_email:null,customer_address:null,customer_postal_city:null,pending_order:null,application_data:{}};};
const saveSession=s=>{if(!pool){memorySessions.set(String(s.chat_id),s);return Promise.resolve();}return pool.query(`INSERT INTO telegram_shop_sessions(chat_id,state,cart,customer_name,customer_email,customer_address,customer_postal_city,pending_order,application_data,updated_at) VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9::jsonb,now()) ON CONFLICT(chat_id) DO UPDATE SET state=EXCLUDED.state,cart=EXCLUDED.cart,customer_name=EXCLUDED.customer_name,customer_email=EXCLUDED.customer_email,customer_address=EXCLUDED.customer_address,customer_postal_city=EXCLUDED.customer_postal_city,pending_order=EXCLUDED.pending_order,application_data=EXCLUDED.application_data,updated_at=now()`,[s.chat_id,s.state,JSON.stringify(s.cart||{}),s.customer_name,s.customer_email,s.customer_address,s.customer_postal_city,s.pending_order,JSON.stringify(s.application_data||{})]);};
const money=n=>'$'+Number(n).toFixed(2);
const orderId=()=> 'RO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
const orderTable=`CREATE TABLE IF NOT EXISTS shop_orders(
 order_number text PRIMARY KEY, customer_name text NOT NULL, customer_email text,
 telegram_chat_id text, items jsonb NOT NULL, total numeric(12,2) NOT NULL,
 txid text, status text NOT NULL DEFAULT 'awaiting_txid',
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
)`;
async function init(){if(pool){await pool.query(orderTable);await pool.query('ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS customer_address text');await pool.query('ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS customer_postal_city text');await pool.query(`CREATE TABLE IF NOT EXISTS telegram_shop_sessions(chat_id text PRIMARY KEY,state text NOT NULL DEFAULT 'cart',cart jsonb NOT NULL DEFAULT '{}'::jsonb,customer_name text,customer_email text,pending_order text,application_data jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now())`);await pool.query('ALTER TABLE telegram_shop_sessions ADD COLUMN IF NOT EXISTS customer_address text');await pool.query('ALTER TABLE telegram_shop_sessions ADD COLUMN IF NOT EXISTS customer_postal_city text');await pool.query('ALTER TABLE telegram_shop_sessions ADD COLUMN IF NOT EXISTS application_data jsonb NOT NULL DEFAULT \'{}\'::jsonb');await pool.query(`CREATE TABLE IF NOT EXISTS membership_applications(id text PRIMARY KEY,telegram_chat_id text NOT NULL,full_name text NOT NULL,email text NOT NULL,address text NOT NULL,goals text NOT NULL,motivation text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now())`);}}
async function tg(method,payload){
 if(!process.env.TELEGRAM_BOT_TOKEN)throw new Error('TELEGRAM_BOT_TOKEN is not configured in the backend environment.');
 let response,lastError;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   response=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   break;
  }catch(error){
   lastError=error;
   console.error('Telegram network attempt '+attempt+' failed:',error.cause?.code||error.cause?.message||error.message);
   if(attempt<3)await new Promise(resolve=>setTimeout(resolve,500*attempt));
  }
 }
 if(!response)throw new Error('Telegram network request failed after 3 attempts: '+(lastError?.cause?.code||lastError?.message||'unknown error'));
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.ok!==true)throw new Error(data.description||'Telegram API failed');
 return data.result;
}
const productKeyboard=()=>({inline_keyboard:[...catalog.map(p=>[{text:p.name+' · '+money(p.price),callback_data:'add:'+p.id}]),[{text:'🛒 View cart',callback_data:'cart'}]]});
function cartKeyboard(cart){const rows=catalog.filter(p=>cart[p.id]).map(p=>[{text:'− '+p.name,callback_data:'dec:'+p.id},{text:String(cart[p.id])+'×',callback_data:'noop'},{text:'+ '+p.name,callback_data:'add:'+p.id}]);rows.push([{text:'Proceed to checkout',callback_data:'checkout'}],[{text:'Products',callback_data:'menu'}],[{text:'Apply for membership',callback_data:'membership:start'}]);return {inline_keyboard:rows};}
function welcomeKeyboard(){return {inline_keyboard:[
 [{text:'🚀 START',callback_data:'start:shop'}],
 [{text:'🧾 Order / Submit TXID',callback_data:'order:txid'}],
 [{text:'👑 Apply for membership',callback_data:'membership:start'}],
 [{text:'📄 Open application portal',url:'https://the-house-of-rothshild-illuminati.onrender.com/bewerbung.html'}],
 [{text:'💬 Contact support',url:'https://t.me/Rothshild_Adriano'}],
 [{text:'🌐 Visit website',url:origin}]
]};}
const applicationPrompts={membership_name:'Please enter your full name.',membership_email:'Please enter your email address.',membership_address:'Please enter your full mailing address.',membership_goals:'What personal goals would you like to achieve?',membership_motivation:'Why would you like to apply?'};
function applicationMessage(a){return '📩 New membership application\nName: '+a.full_name+'\nEmail: '+a.email+'\nAddress: '+a.address+'\nPersonal goals: '+a.goals+'\nMotivation: '+a.motivation;}
function supportDraftUrl(text){return 'https://t.me/Rothshild_Adriano?text='+encodeURIComponent(text);}
function cartRows(cart){return catalog.filter(p=>cart[p.id]).map(p=>({...p,quantity:cart[p.id],lineTotal:p.price*cart[p.id]}));}
function cartText(cart){const rows=cartRows(cart);if(!rows.length)return 'Your cart is empty. Choose some products:';return '🛒 Your cart\n'+rows.map(p=>p.name+' × '+p.quantity+' — '+money(p.lineTotal)).join('\n')+'\n\nTotal: '+money(rows.reduce((a,p)=>a+p.lineTotal,0));}
async function saveOrder(order){if(!pool)throw new Error('DATABASE_URL must be configured in the backend to persist orders.');await pool.query('INSERT INTO shop_orders(order_number,customer_name,customer_email,customer_address,customer_postal_city,telegram_chat_id,items,total,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',[order.id,order.name,order.email||null,order.address||null,order.postalCity||null,order.chatId||null,JSON.stringify(order.items),order.total,order.status||'awaiting_txid']);}
async function getOrder(id){if(!pool)return null;const r=await pool.query('SELECT * FROM shop_orders WHERE order_number=$1',[id]);return r.rows[0]||null;}
async function adminOrder(order){const lines=order.items.map(i=>i.name+' × '+i.quantity+' — '+money(i.lineTotal)).join('\n');return tg('sendMessage',{chat_id:adminChatTarget(),text:'🛍 New order\n'+order.id+'\nKunde: '+order.name+'\nEmail: '+(order.email||'not provided')+'\nAddress: '+(order.address||'not provided')+'\n\n'+lines+'\n\nTotal: '+money(order.total)+'\nStatus: TXID/payment pending.',reply_markup:{inline_keyboard:[[{text:'Review TXID / confirm payment',callback_data:'review:'+order.id}]]}});}
app.get('/api/health',(req,res)=>res.json({ok:true,storage:pool?'postgres':'unavailable'}));
app.post('/api/telegram/webhook',async(req,res)=>{
 try{
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
  if(secret&&req.get('x-telegram-bot-api-secret-token')!==secret)return res.sendStatus(403);
  const update=req.body||{};
  const msg=update.message,cb=update.callback_query;
  if(msg?.text){
   const chat=String(msg.chat.id),text=clean(msg.text,1000);
   let session=await getSession(chat);
   if(/^\/(?:start|menu)(?:@\w+)?(?:\s|$)/i.test(text)){
    const activeNote=session.state.startsWith('membership_')
      ? '\n\n📝 Your membership application is still in progress. Next: '+(applicationPrompts[session.state]||'Please continue.')
      : ['name','email','address','postal_city','confirm'].includes(session.state)
        ? '\n\n🛒 Your checkout is saved. Send the requested information to continue.'
        : session.state==='txid'&&session.pending_order
          ? '\n\n🧾 Deine Bestellung '+session.pending_order+' is open. Use “Order / Submit TXID” to submit your transaction ID.'
          : '';
    const welcome='👑 WELCOME TO THE HOUSE OF ROTHSCHILD\n\nWelcome to the official House of Rothschild Telegram assistant. Browse our products, manage your orders, submit a Bitcoin transaction ID (TXID) for review, and apply for membership.\n\n🛍 Shop and orders\n💳 Bitcoin payments and TXID review\n📄 Invoice after payment confirmation\n📝 Membership applications\n💬 Support: @Rothshild_Adriano\n\nTap START below to continue. Payments are marked as confirmed only after manual verification.'+activeNote;
    await tg('sendMessage',{chat_id:msg.chat.id,text:welcome,reply_markup:{inline_keyboard:[[{text:'🚀 START',callback_data:'start:shop'}],[{text:'🛍 Shop & Products',callback_data:'menu'}],[{text:'👑 Apply for membership',callback_data:'membership:start'}],[{text:'💬 Contact support',url:'https://t.me/Rothshild_Adriano'}],[{text:'🌐 Visit website',url:origin}]]}});
  }
   else if(session.state.startsWith('membership_')){
    const a=session.application_data||{};
    if(session.state==='membership_name'){
     if(text.length<2||text.length>150)await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your full name (2–150 characters).'});
     else{a.full_name=text;session.state='membership_email';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Cancel application',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_email'){
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))await tg('sendMessage',{chat_id:msg.chat.id,text:'That email address is invalid. Please try again.'});
     else{a.email=text.toLowerCase();session.state='membership_address';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Cancel application',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_address'){
     if(text.length<5||text.length>500)await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your full address (5–500 characters).'});
     else{a.address=text;session.state='membership_goals';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Cancel application',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_goals'){
     if(text.length<3||text.length>5000)await tg('sendMessage',{chat_id:msg.chat.id,text:'Please describe your goals (3–5000 characters).'});
     else{a.goals=text;session.state='membership_motivation';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Cancel application',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_motivation'){
     if(text.length<3||text.length>5000)await tg('sendMessage',{chat_id:msg.chat.id,text:'Please describe your motivation (3–5000 characters).'});
     else{
      a.motivation=text;
      const aid='MA-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
      await pool.query('INSERT INTO membership_applications(id,telegram_chat_id,full_name,email,address,goals,motivation) VALUES($1,$2,$3,$4,$5,$6,$7)',[aid,chat,a.full_name,a.email,a.address,a.goals,a.motivation]);
      session.state='cart';session.application_data={};await saveSession(session);
      await tg('sendMessage',{chat_id:msg.chat.id,text:'Thank you. Your application has been saved. Application number: '+aid+'. The administration has been notified. You can also open a prepared message to support and send it yourself.',reply_markup:{inline_keyboard:[[{text:'💬 Send application details to support',url:supportDraftUrl('Hello Rothshild Support, I would like to discuss my application.\nBewerbungsnummer: '+aid+'\nName: '+a.full_name+'\nEmail: '+a.email+'\nAddress: '+a.address+'\nGoals: '+a.goals+'\nMotivation: '+a.motivation)}],...welcomeKeyboard().inline_keyboard]}});
      try{await tg('sendMessage',{chat_id:adminChatTarget(),text:'📝 Membership application '+aid+'\n'+applicationMessage(a),reply_markup:{inline_keyboard:[[{text:'Bewerbungsportal öffnen',url:'https://the-house-of-rothshild-illuminati.onrender.com/bewerbung.html'}]]}});}catch(adminError){console.error('Membership admin notification failed:',adminError.message);}
     }
    }
   }else if(session.state==='name'){
    if(text.length<2){await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your full name.'});}
    else {session.customer_name=text;session.state='email';await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your email address (or send “-” if you prefer not to provide one).'});}
   }else if(session.state==='email'){
    const email=text==='-'?'':text.toLowerCase();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){await tg('sendMessage',{chat_id:msg.chat.id,text:'That email address looks invalid. Please try again or send “-”.'});}
    else {
     session.customer_email=email;session.state='address';await saveSession(session);
     await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your full delivery address, including street, house number, postal code, and city.'});
    }
   }else if(session.state==='address'){
    if(text.length<5||text.length>200){await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your street and house number (5–200 characters).'});}
    else{session.customer_address=text;session.state='postal_city';await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter your postal code and city (for example: 72766 Reutlingen).'});}
   }else if(session.state==='postal_city'){
    if(!/^[0-9]{4,6}\s+.{2,80}$/.test(text)){await tg('sendMessage',{chat_id:msg.chat.id,text:'Please enter a valid postal code and city, for example: 72766 Reutlingen.'});}
    else{
     session.customer_postal_city=text;session.state='confirm';await saveSession(session);
     const rows=cartRows(session.cart),total=rows.reduce((a,p)=>a+p.lineTotal,0);
     const summary='🧾 ORDER SUMMARY\n\nName: '+session.customer_name+'\nEmail: '+(session.customer_email||'not provided')+'\nStreet: '+session.customer_address+'\nPostal code / City: '+session.customer_postal_city+'\n\n'+rows.map(p=>p.name+' × '+p.quantity+' — '+money(p.lineTotal)).join('\n')+'\n\nTotal: '+money(total)+'\n\nPlease review your details and confirm your order.';
     await tg('sendMessage',{chat_id:msg.chat.id,text:summary,reply_markup:{inline_keyboard:[[{text:'✅ Confirm order',callback_data:'order:confirm'}],[{text:'✏️ Edit address',callback_data:'order:edit'}],[{text:'🛒 View cart',callback_data:'cart'}]]}});
    }
   }else if(session.state==='txid'&&session.pending_order){
    const id=session.pending_order;
    if(text.length<8){await tg('sendMessage',{chat_id:msg.chat.id,text:'Please send a complete transaction ID (TXID).'});}
    else {
     const updated=await pool.query("UPDATE shop_orders SET txid=$1,status='txid_submitted' WHERE order_number=$2 AND telegram_chat_id=$3 AND status IN ('awaiting_txid','txid_submitted') RETURNING *",[text,id,chat]);
     if(!updated.rowCount){await tg('sendMessage',{chat_id:msg.chat.id,text:'This order was not found or has already been completed. Please contact support.'});}
     else{
       await tg('sendMessage',{chat_id:msg.chat.id,text:'TXID for '+id+' has been saved and submitted for manual review. Payment remains pending until it is confirmed. You can prepare a message to support with your order number and TXID.',reply_markup:{inline_keyboard:[[{text:'💬 Send order details to support',url:supportDraftUrl('Hello Rothshild Support, please review my order.\nBestellnummer: '+id+'\nTXID: '+text+'\nStatus: submitted for manual review.\nInvoice: '+origin+'/api/shop/invoice/'+id)}],...welcomeKeyboard().inline_keyboard]}});
       try{await tg('sendMessage',{chat_id:adminChatTarget(),text:'🔎 TXID received\nOrder: '+id+'\nTXID: '+text+'\nPlease verify independently.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+id},{text:'Ablehnen',callback_data:'reject:'+id}]]}});}catch(adminError){console.error('TXID admin notification failed:',adminError.message);}
     }
    }
   }else {await tg('sendMessage',{chat_id:msg.chat.id,text:'Send /start to open the shop.'});}
  }else if(cb){
   const chat=String(cb.message.chat.id),data=String(cb.data||'');let session=await getSession(chat);
   if(data.startsWith('add:')){const p=catalog.find(p=>p.id===data.slice(4));if(p)session.cart[p.id]=Math.min(25,(session.cart[p.id]||0)+1);await saveSession(session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data.startsWith('dec:')){const id=data.slice(4);session.cart[id]=Math.max(0,(session.cart[id]||0)-1);await saveSession(session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data==='order:confirm'){
    if(session.state!=='confirm'||!cartRows(session.cart).length){
     await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'No order is ready for confirmation.'});
    }else{
     const rows=cartRows(session.cart),total=rows.reduce((sum,p)=>sum+p.lineTotal,0),id=orderId();
     const order={id,name:session.customer_name,email:session.customer_email||'',address:session.customer_address,postalCity:session.customer_postal_city,chatId:chat,items:rows,total,status:'awaiting_txid'};
     await saveOrder(order);
     session.state='txid';session.pending_order=id;await saveSession(session);
     const btcAddress='12RFpbxvFpWSzk6H3Y4faNRTf9vTzfVKPF';
     const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=420x420&format=png&data='+encodeURIComponent('bitcoin:'+btcAddress);
     await tg('sendMessage',{chat_id:cb.message.chat.id,text:`✅ Bestellung bestätigt
Bestellnummer: ${id}
Gesamtbetrag: ${money(total)}
Die Bestellung wurde gespeichert. Die Bitcoin-Zahlungsdaten folgen jetzt.`});
     await tg('sendPhoto',{chat_id:cb.message.chat.id,photo:qrUrl,caption:`₿ Bitcoin-Payment for Bestellung ${id}
Gesamtbetrag: ${money(total)}

Bitte ausschließlich das Bitcoin-Netzwerk verwenden. Den BTC-Betrag anhand des Bestellbetrags in deiner Wallet eingeben. Zahlung wird erst nach manueller Prüfung bestätigt.`});
     await tg('sendMessage',{chat_id:cb.message.chat.id,text:`Bitcoin-Zahlungsadresse (kopieren):
${btcAddress}

Bestellung: ${id}
Gesamtbetrag: ${money(total)}

Nach der Überweisung sende die Bitcoin-Transaktions-ID (TXID) als nächste Nachricht. Sie wird an die Administration zur manuellen Prüfung weitergeleitet.`,reply_markup:{inline_keyboard:[[{text:'📋 TXID übermitteln',callback_data:'txid:submit'}],[{text:'🧾 Order / Submit TXID',callback_data:'order:txid'}],[{text:'💬 Telegram-Support öffnen',url:supportDraftUrl('Hallo Rothshild Support, bitte prüft Bestellung '+id+'.')}]]}});
     try{await adminOrder(order);}catch(adminError){console.error('Order admin notification failed:',adminError.message);}
    }
   }
   else if(data==='order:edit'){
    session.state='address';await saveSession(session);
    await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Please enter your street and house number again.'});
   }
   else if(data==='order:txid'){
    if(session.state==='txid'&&session.pending_order){
      await tg('sendMessage',{chat_id:cb.message.chat.id,text:'🧾 Open order: '+session.pending_order+'\nPlease send your complete Bitcoin transaction ID (TXID) in your next message. Payment remains pending until manual review.'});
    }else{
      await tg('sendMessage',{chat_id:cb.message.chat.id,text:'No open order awaiting a TXID was found. Open the shop and place an order first.',reply_markup:{inline_keyboard:[[{text:'🛍 Open shop',callback_data:'menu'}]]}});
    }
   }
   else if(data==='start:shop'){session.state='cart';await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Welcome! Choose your products below. You can adjust quantities in your cart and proceed to checkout when ready.',reply_markup:productKeyboard()});}
   else if(data==='menu')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:'Choose products:',reply_markup:productKeyboard()});
   else if(data==='cart')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});
   else if(data==='membership:start'){session.state='membership_name';session.application_data={};await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'MEMBERSHIP APPLICATION\nPlease complete the application. Your details will be submitted to the administration for review.\n\n'+applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Cancel application',callback_data:'membership:cancel'}]]}});}
   else if(data==='membership:cancel'){session.state='cart';session.application_data={};await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Your application has been cancelled. You can start again at any time.',reply_markup:welcomeKeyboard()});}
   else if(data==='txid:submit'){
    if(session.state==='txid'&&session.pending_order)await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Please send your complete Bitcoin transaction ID (TXID) in your next message.'});
    else await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'No open order awaiting a TXID.'});
   }
   else if(data==='noop'){}
   else if(data==='checkout'){if(!cartRows(session.cart).length)await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Your cart is empty.'});else{session.state='name';await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Please enter your full name to place your order.'});}}
   else if(data.startsWith('paid:')||data.startsWith('reject:')){
    if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID)){await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});}
    else {const id=data.slice(data.indexOf(':')+1),paid=data.startsWith('paid:');await pool.query('UPDATE shop_orders SET status=$1,paid_at=CASE WHEN $2 THEN now() ELSE paid_at END WHERE order_number=$3',[paid?'paid':'payment_rejected',paid,id]);const order=await getOrder(id);if(order?.telegram_chat_id){if(paid){const lines=(order.items||[]).map(i=>i.name+' × '+i.quantity+' — '+money(i.lineTotal)).join('\n');const body='Guten Tag Rothshild Team,\n\nbitte bestätigt mir den Erhalt meiner Bestellung und Rechnung.\n\nBestellnummer: '+order.order_number+'\nName: '+order.customer_name+'\nMeine E-Mail: '+(order.customer_email||'not provided')+'\nDelivery address: '+(order.customer_address||'not provided')+'\nPostal code / City: '+(order.customer_postal_city||'not provided')+'\nItems:\n'+lines+'\nTotal: '+money(order.total)+'\nPayment status: manually verified\nInvoice: '+origin+'/api/shop/invoice/'+id+'\n\nThank you.';const compose='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent('rothschildofficial938@gmail.com')+'&su='+encodeURIComponent('Order and invoice '+id)+'&body='+encodeURIComponent(body);await tg('sendMessage',{chat_id:order.telegram_chat_id,text:'✅ Die Payment for '+id+' has been manually verified. Your invoice is now available. You can open the prepared email containing your order number, contact details, items, and invoice link, then send it yourself.',reply_markup:{inline_keyboard:[[{text:'🧾 Open invoice',url:origin+'/api/shop/invoice/'+id}],[{text:'✉️ E-Mail an Rothshild senden',url:compose}]]}});}else await tg('sendMessage',{chat_id:order.telegram_chat_id,text:'Payment for '+id+' was not confirmed. Please contact support at @Rothshild_Adriano.'});}await tg('answerCallbackQuery',{callback_query_id:cb.id,text:paid?'Payment confirmed':'Abgelehnt'});}
   }
   else if(data.startsWith('review:')){if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID))await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});else{const order=await getOrder(data.slice(7));await tg('sendMessage',{chat_id:cb.message.chat.id,text:order?'Bestellung '+order.order_number+'\nStatus: '+order.status+'\nTXID: '+(order.txid||'noch keine'):'Order not found.'});}}
   await tg('answerCallbackQuery',{callback_query_id:cb.id});
  }
  res.sendStatus(200);
 }catch(e){console.error('Telegram webhook error:',e.stack||e.message);res.sendStatus(500);}
});
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100),email=clean(req.body?.customerEmail,254).toLowerCase(),address=clean(req.body?.customerAddress,500),raw=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||raw.length<1||raw.length>20)return res.status(400).json({error:'Name, valid email address, and cart are required.'});
  const items=[];for(const item of raw){const p=catalog.find(p=>p.name===clean(item.name,100)),qty=Number(item.quantity);if(!p||!Number.isInteger(qty)||qty<1||qty>25)return res.status(400).json({error:'Invalid product or quantity.'});items.push({...p,quantity:qty,lineTotal:p.price*qty});}
  const total=items.reduce((s,i)=>s+i.lineTotal,0),id=orderId(),order={id,name,email,address,chatId:null,items,total,status:'awaiting_txid'};
  await saveOrder(order);await adminOrder(order);res.status(201).json({ok:true,orderNumber:id,total,status:order.status,txidUrl:origin+'/api/shop/txid/'+id});
 }catch(e){console.error('Web order failed:',e.message);res.status(500).json({error:'The order could not be saved or submitted.'});}
});
app.post('/api/shop/txid/:id',async(req,res)=>{
 const txid=clean(req.body?.txid,300);if(txid.length<8)return res.status(400).json({error:'TXID ist zu kurz.'});
 try{const r=await pool.query("UPDATE shop_orders SET txid=$1,status='txid_submitted' WHERE order_number=$2 AND status IN ('awaiting_txid','txid_submitted') RETURNING *",[txid,clean(req.params.id,40)]);if(!r.rowCount)return res.status(404).json({error:'Bestellung nicht gefunden oder bereits abgeschlossen.'});const o=r.rows[0];await tg('sendMessage',{chat_id:adminChatTarget(),text:'TXID for Webbestellung '+o.order_number+'\nKunde: '+o.customer_name+' ('+o.customer_email+')\nTXID: '+txid+'\nGesamt: '+money(o.total)+'\nPlease review manually.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+o.order_number},{text:'Ablehnen',callback_data:'reject:'+o.order_number}]]}});res.json({ok:true,status:'txid_submitted'});}catch(e){console.error(e.message);res.status(500).json({error:'TXID konnte nicht gespeichert werden.'});}
});
app.get('/api/shop/invoice/:id',async(req,res)=>{try{const o=await getOrder(clean(req.params.id,40));if(!o||o.status!=='paid')return res.status(404).send('Rechnung erst nach bestätigter Zahlung verfügbar.');const lines=o.items.map(i=>'<tr><td>'+escapeHtml(i.name)+'</td><td>'+i.quantity+'</td><td>'+money(i.lineTotal)+'</td></tr>').join('');const body='Guten Tag Rothshild Team,\n\nbitte bestätigt mir den Erhalt meiner Bestellung und Rechnung.\n\nBestellnummer: '+o.order_number+'\nName: '+o.customer_name+'\nMeine E-Mail: '+(o.customer_email||'not provided')+'\nDelivery address: '+(o.customer_address||'not provided')+'\nPostal code / City: '+(o.customer_postal_city||'not provided')+'\nItems:\n'+(o.items||[]).map(i=>i.name+' × '+i.quantity+' — '+money(i.lineTotal)).join('\n')+'\nTotal: '+money(o.total)+'\nPayment status: manually verified\nInvoice: '+origin+'/api/shop/invoice/'+o.order_number+'\n\nThank you.';const mailto='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent('Order and invoice '+o.order_number)+'&body='+encodeURIComponent(body);res.type('html').send('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rechnung '+o.order_number+'</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px;color:#222}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ccc;text-align:left}.actions{margin:20px 0;display:flex;gap:12px;flex-wrap:wrap}.actions a,.actions button{padding:12px 18px;border-radius:8px;background:#211044;color:white;text-decoration:none;border:0;font-size:16px}@media print{.actions{display:none}}</style><h1>Rechnung</h1><p>ROTHSHILD · Order of Light</p><p>Rechnungsnummer: '+escapeHtml(o.order_number)+'<br>Kunde: '+escapeHtml(o.customer_name)+'<br>E-Mail: '+escapeHtml(o.customer_email||'not provided')+'<br>Lieferadresse: '+escapeHtml(o.customer_address||'not provided')+'<br>PLZ / Ort: '+escapeHtml(o.customer_postal_city||'not provided')+'<br>Datum: '+new Date(o.paid_at).toLocaleDateString('de-DE')+'</p><table><thead><tr><th>Artikel</th><th>Menge</th><th>Betrag</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Gesamt: '+money(o.total)+'</h2><p>Zahlungsstatus: manuell bestätigt</p><div class="actions"><a href="'+mailto+'">✉️ E-Mail an Rothshild senden</a><button onclick="window.print()">Drucken / Als PDF speichern</button></div></html>');}catch(e){res.status(500).send('The invoice could not be loaded.');}});
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const port=Number(process.env.PORT||3000);
await init();
app.listen(port,'0.0.0.0',()=>{console.log('ROTHSHILD Telegram order API listening on '+port);void configureTelegramWebhook();});
async function configureTelegramWebhook(){
 if(!process.env.TELEGRAM_BOT_TOKEN)return console.warn('Telegram webhook not configured: TELEGRAM_BOT_TOKEN is missing.');
 const base=(process.env.RENDER_EXTERNAL_URL||process.env.TELEGRAM_WEBHOOK_BASE_URL||'').replace(/\/$/,'');
 if(!base)return console.warn('Telegram webhook not configured: set RENDER_EXTERNAL_URL or TELEGRAM_WEBHOOK_BASE_URL to this API service URL.');
 const url=base+'/api/telegram/webhook';
 try{const result=await tg('setWebhook',{url,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET||undefined,allowed_updates:['message','callback_query'],drop_pending_updates:false});console.log('Telegram webhook registration:',result===true?'success':'not confirmed');}catch(e){console.error('Telegram webhook registration failed:',e.message);}
}
