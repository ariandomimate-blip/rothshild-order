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
const productKeyboard=()=>({inline_keyboard:[...catalog.map(p=>[{text:p.name+' · '+money(p.price),callback_data:'add:'+p.id}]),[{text:'🛒 Warenkorb',callback_data:'cart'}]]});
function cartKeyboard(cart){const rows=catalog.filter(p=>cart[p.id]).map(p=>[{text:'− '+p.name,callback_data:'dec:'+p.id},{text:String(cart[p.id])+'×',callback_data:'noop'},{text:'+ '+p.name,callback_data:'add:'+p.id}]);rows.push([{text:'Zur Kasse',callback_data:'checkout'}],[{text:'Produkte',callback_data:'menu'}],[{text:'Mitgliedschaftsverfahren',callback_data:'membership:start'}]);return {inline_keyboard:rows};}
function welcomeKeyboard(){return {inline_keyboard:[
 [{text:'🛍 Shop & Produkte',callback_data:'menu'}],
 [{text:'🧾 Bestellung / TXID',callback_data:'order:txid'}],
 [{text:'👑 Mitgliedschaft beantragen',callback_data:'membership:start'}],
 [{text:'📄 Bewerbungsportal öffnen',url:'https://the-house-of-rothshild-illuminati.onrender.com/bewerbung.html'}],
 [{text:'💬 Support kontaktieren',url:'https://t.me/Rothshild_Adriano'}],
 [{text:'🌐 Website öffnen',url:origin}]
]};}
const applicationPrompts={membership_name:'Bitte gib deinen vollständigen Namen ein.',membership_email:'Bitte sende deine E-Mail-Adresse.',membership_address:'Bitte gib deine vollständige Anschrift ein.',membership_goals:'Welche persönlichen Ziele möchtest du erreichen?',membership_motivation:'Warum möchtest du dich bewerben?'};
function applicationMessage(a){return '📩 Neue Mitgliedschaftsbewerbung\nName: '+a.full_name+'\nE-Mail: '+a.email+'\nAnschrift: '+a.address+'\nPersönliche Ziele: '+a.goals+'\nMotivation: '+a.motivation;}
function supportDraftUrl(text){return 'https://t.me/Rothshild_Adriano?text='+encodeURIComponent(text);}
function cartRows(cart){return catalog.filter(p=>cart[p.id]).map(p=>({...p,quantity:cart[p.id],lineTotal:p.price*cart[p.id]}));}
function cartText(cart){const rows=cartRows(cart);if(!rows.length)return 'Der Warenkorb ist leer. Wähle Produkte:';return '🛒 Warenkorb\n'+rows.map(p=>p.name+' × '+p.quantity+' — '+money(p.lineTotal)).join('\n')+'\n\nGesamt: '+money(rows.reduce((a,p)=>a+p.lineTotal,0));}
async function saveOrder(order){if(!pool)throw new Error('DATABASE_URL muss im Backend gesetzt sein, damit Bestellungen dauerhaft gespeichert werden.');await pool.query('INSERT INTO shop_orders(order_number,customer_name,customer_email,customer_address,customer_postal_city,telegram_chat_id,items,total,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',[order.id,order.name,order.email||null,order.address||null,order.postalCity||null,order.chatId||null,JSON.stringify(order.items),order.total,order.status||'awaiting_txid']);}
async function getOrder(id){if(!pool)return null;const r=await pool.query('SELECT * FROM shop_orders WHERE order_number=$1',[id]);return r.rows[0]||null;}
async function adminOrder(order){const lines=order.items.map(i=>i.name+' × '+i.quantity+' — '+money(i.lineTotal)).join('\n');return tg('sendMessage',{chat_id:adminChatTarget(),text:'🛍 Neue Bestellung\n'+order.id+'\nKunde: '+order.name+'\nE-Mail: '+(order.email||'nicht angegeben')+'\nAdresse: '+(order.address||'nicht angegeben')+'\n\n'+lines+'\n\nGesamt: '+money(order.total)+'\nStatus: TXID/Zahlung offen.',reply_markup:{inline_keyboard:[[{text:'TXID prüfen / Zahlung bestätigen',callback_data:'review:'+order.id}]]}});}
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
   if(text==='/start'||text==='/menu'){
    const activeNote=session.state.startsWith('membership_')
      ? '\n\n📝 Deine Mitgliedschaftsbewerbung ist noch offen. Nächste Angabe: '+(applicationPrompts[session.state]||'Bitte fahre fort.')
      : ['name','email','address','postal_city','confirm'].includes(session.state)
        ? '\n\n🛒 Dein Checkout ist gespeichert. Bitte sende die angeforderte Angabe, um fortzufahren.'
        : session.state==='txid'&&session.pending_order
          ? '\n\n🧾 Deine Bestellung '+session.pending_order+' ist offen. Nutze „Bestellung / TXID“, um die Transaktions-ID einzureichen.'
          : '';
    const welcome='👑 WILLKOMMEN IM HOUSE OF ROTHSCHILD\n\nWillkommen im Telegram-Service des Rothshild-Webshops. Hier findest du Produkte, kannst Bestellungen verwalten, eine Bitcoin-TXID zur Prüfung übermitteln und Mitgliedschaftsanfragen einreichen.\n\n🛍 Shop & Bestellungen\n💳 Bitcoin-Zahlung und TXID-Prüfung\n📄 Rechnung nach bestätigter Zahlung\n📝 Mitgliedschaft und Bewerbungsportal\n💬 Support über @Rothshild_Adriano\n\nWähle eine Option unten. Zahlungen werden ausschließlich nach manueller Prüfung bestätigt.'+activeNote;
    await tg('sendMessage',{chat_id:msg.chat.id,text:welcome,reply_markup:welcomeKeyboard()});
  }
   else if(session.state.startsWith('membership_')){
    const a=session.application_data||{};
    if(session.state==='membership_name'){
     if(text.length<2||text.length>150)await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib einen vollständigen Namen ein (2–150 Zeichen).'});
     else{a.full_name=text;session.state='membership_email';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Bewerbung abbrechen',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_email'){
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))await tg('sendMessage',{chat_id:msg.chat.id,text:'Die E-Mail-Adresse ist ungültig. Bitte erneut eingeben.'});
     else{a.email=text.toLowerCase();session.state='membership_address';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Bewerbung abbrechen',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_address'){
     if(text.length<5||text.length>500)await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib eine vollständige Anschrift ein (5–500 Zeichen).'});
     else{a.address=text;session.state='membership_goals';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Bewerbung abbrechen',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_goals'){
     if(text.length<3||text.length>5000)await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte beschreibe deine Ziele (3–5000 Zeichen).'});
     else{a.goals=text;session.state='membership_motivation';session.application_data=a;await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Bewerbung abbrechen',callback_data:'membership:cancel'}]]}});}
    }else if(session.state==='membership_motivation'){
     if(text.length<3||text.length>5000)await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte beschreibe deine Motivation (3–5000 Zeichen).'});
     else{
      a.motivation=text;
      const aid='MA-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
      await pool.query('INSERT INTO membership_applications(id,telegram_chat_id,full_name,email,address,goals,motivation) VALUES($1,$2,$3,$4,$5,$6,$7)',[aid,chat,a.full_name,a.email,a.address,a.goals,a.motivation]);
      session.state='cart';session.application_data={};await saveSession(session);
      await tg('sendMessage',{chat_id:msg.chat.id,text:'Vielen Dank. Deine Bewerbung wurde gespeichert. Bewerbungsnummer: '+aid+'. Die Administration wurde benachrichtigt. Wenn du möchtest, kannst du die Angaben zusätzlich als vorbereitete Privatnachricht an den Support öffnen und selbst absenden.',reply_markup:{inline_keyboard:[[{text:'💬 Bewerbungsdaten an Support senden',url:supportDraftUrl('Hallo Rothshild Support, ich möchte meine Bewerbung besprechen.\nBewerbungsnummer: '+aid+'\nName: '+a.full_name+'\nE-Mail: '+a.email+'\nAnschrift: '+a.address+'\nZiele: '+a.goals+'\nMotivation: '+a.motivation)}],...welcomeKeyboard().inline_keyboard]}});
      try{await tg('sendMessage',{chat_id:adminChatTarget(),text:'📝 Mitgliedschaftsantrag '+aid+'\n'+applicationMessage(a),reply_markup:{inline_keyboard:[[{text:'Bewerbungsportal öffnen',url:'https://the-house-of-rothshild-illuminati.onrender.com/bewerbung.html'}]]}});}catch(adminError){console.error('Membership admin notification failed:',adminError.message);}
     }
    }
   }else if(session.state==='name'){
    if(text.length<2){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib einen vollständigen Namen ein.'});}
    else {session.customer_name=text;session.state='email';await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte sende deine E-Mail-Adresse (oder „-“, falls du keine angeben möchtest).'});}
   }else if(session.state==='email'){
    const email=text==='-'?'':text.toLowerCase();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){await tg('sendMessage',{chat_id:msg.chat.id,text:'Die E-Mail sieht ungültig aus. Bitte erneut eingeben oder „-“ senden.'});}
    else {
     session.customer_email=email;session.state='address';await saveSession(session);
     await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib deine vollständige Lieferanschrift mit Straße, Hausnummer, Postleitzahl und Ort ein.'});
    }
   }else if(session.state==='address'){
    if(text.length<5||text.length>200){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib Straße und Hausnummer ein (5–200 Zeichen).'});}
    else{session.customer_address=text;session.state='postal_city';await saveSession(session);await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib jetzt Postleitzahl und Ort ein (zum Beispiel: 72766 Reutlingen).'});}
   }else if(session.state==='postal_city'){
    if(!/^[0-9]{4,6}\\s+.{2,80}$/.test(text)){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte gib eine gültige Postleitzahl und den Ort ein, zum Beispiel: 72766 Reutlingen.'});}
    else{
     session.customer_postal_city=text;session.state='confirm';await saveSession(session);
     const rows=cartRows(session.cart),total=rows.reduce((a,p)=>a+p.lineTotal,0);
     const summary='🧾 BESTELLÜBERSICHT\\n\\nName: '+session.customer_name+'\\nE-Mail: '+(session.customer_email||'nicht angegeben')+'\\nStraße: '+session.customer_address+'\\nPLZ / Ort: '+session.customer_postal_city+'\\n\\n'+rows.map(p=>p.name+' × '+p.quantity+' — '+money(p.lineTotal)).join('\\n')+'\\n\\nGesamtbetrag: '+money(total)+'\\n\\nBitte prüfe deine Angaben und bestätige die Bestellung.';
     await tg('sendMessage',{chat_id:msg.chat.id,text:summary,reply_markup:{inline_keyboard:[[{text:'✅ Bestellung bestätigen',callback_data:'order:confirm'}],[{text:'✏️ Adresse ändern',callback_data:'order:edit'}],[{text:'🛒 Warenkorb anzeigen',callback_data:'cart'}]]}});
    }
   }}else if(session.state==='txid'&&session.pending_order){
    const id=session.pending_order;
    if(text.length<8){await tg('sendMessage',{chat_id:msg.chat.id,text:'Bitte sende eine vollständige TXID.'});}
    else {
     const updated=await pool.query("UPDATE shop_orders SET txid=$1,status='txid_submitted' WHERE order_number=$2 AND telegram_chat_id=$3 AND status IN ('awaiting_txid','txid_submitted') RETURNING *",[text,id,chat]);
     if(!updated.rowCount){await tg('sendMessage',{chat_id:msg.chat.id,text:'Diese Bestellung wurde nicht gefunden oder ist bereits abgeschlossen. Bitte kontaktiere den Support.'});}
     else{
       await tg('sendMessage',{chat_id:msg.chat.id,text:'TXID für '+id+' wurde gespeichert und zur manuellen Prüfung eingereicht. Zahlung ist bis zur Bestätigung weiterhin offen. Wenn du möchtest, kannst du eine Nachricht mit Bestellnummer und TXID an den Support vorbereiten.',reply_markup:{inline_keyboard:[[{text:'💬 Bestelldaten an Support senden',url:supportDraftUrl('Hallo Rothshild Support, bitte prüft meine Bestellung.\nBestellnummer: '+id+'\nTXID: '+text+'\nStatus: zur manuellen Prüfung eingereicht.\nRechnung: '+origin+'/api/shop/invoice/'+id)}],...welcomeKeyboard().inline_keyboard]}});
       try{await tg('sendMessage',{chat_id:adminChatTarget(),text:'🔎 TXID eingegangen\nBestellung: '+id+'\nTXID: '+text+'\nBitte unabhängig prüfen.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+id},{text:'Ablehnen',callback_data:'reject:'+id}]]}});}catch(adminError){console.error('TXID admin notification failed:',adminError.message);}
     }
    }
   }else {await tg('sendMessage',{chat_id:msg.chat.id,text:'Nutze /start, um den Shop zu öffnen.'});}
  }else if(cb){
   const chat=String(cb.message.chat.id),data=String(cb.data||'');let session=await getSession(chat);
   if(data.startsWith('add:')){const p=catalog.find(p=>p.id===data.slice(4));if(p)session.cart[p.id]=Math.min(25,(session.cart[p.id]||0)+1);await saveSession(session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data.startsWith('dec:')){const id=data.slice(4);session.cart[id]=Math.max(0,(session.cart[id]||0)-1);await saveSession(session);await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});}
   else if(data==='order:confirm'){\n    if(session.state!=='confirm'||!cartRows(session.cart).length){await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Keine bestätigungsbereite Bestellung gefunden.'});}\n    else{\n     const rows=cartRows(session.cart),total=rows.reduce((a,p)=>a+p.lineTotal,0),id=orderId();\n     const order={id,name:session.customer_name,email:session.customer_email||'',address:session.customer_address,postalCity:session.customer_postal_city,chatId:chat,items:rows,total,status:'awaiting_txid'};\n     await saveOrder(order);session.state='txid';session.pending_order=id;await saveSession(session);\n     const btcAddress='12RFpbxvFpWSzk6H3Y4faNRTf9vTzfVKPF',qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=420x420&format=png&data='+encodeURIComponent('bitcoin:'+btcAddress);\n     await tg('sendMessage',{chat_id:cb.message.chat.id,text:'✅ Bestellung bestätigt\\nBestellnummer: '+id+'\\nGesamtbetrag: '+money(total)+'\\nDie Bestellung wurde gespeichert. Die Bitcoin-Zahlungsdaten folgen jetzt.'});\n     await tg('sendPhoto',{chat_id:cb.message.chat.id,photo:qrUrl,caption:'₿ Bitcoin-Zahlung für Bestellung '+id+'\\nGesamtbetrag: '+money(total)+'\\n\\nBitte ausschließlich das Bitcoin-Netzwerk verwenden. Den BTC-Betrag anhand des Bestellbetrags in deiner Wallet eingeben. Zahlung wird erst nach manueller Prüfung bestätigt.'});\n     await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Bitcoin-Zahlungsadresse (kopieren):\\n'+btcAddress+'\\n\\nBestellung: '+id+'\\nGesamtbetrag: '+money(total)+'\\n\\nNach der Überweisung sende die Bitcoin-Transaktions-ID (TXID) als nächste Nachricht. Sie wird an die Administration zur manuellen Prüfung weitergeleitet.',reply_markup:{inline_keyboard:[[{text:'📋 TXID übermitteln',callback_data:'txid:submit'}],[{text:'🧾 Bestellung / TXID',callback_data:'order:txid'}],[{text:'💬 Telegram-Support öffnen',url:supportDraftUrl('Hallo Rothshild Support, bitte prüft Bestellung '+id+'.') }]]}});\n     try{await adminOrder(order);}catch(adminError){console.error('Order admin notification failed:',adminError.message);}\n    }\n   }\n   else if(data==='order:edit'){session.state='address';await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Bitte gib Straße und Hausnummer erneut ein.'});}\n   else if(data==='order:txid'){
    if(session.state==='txid'&&session.pending_order){
      await tg('sendMessage',{chat_id:cb.message.chat.id,text:'🧾 Offene Bestellung: '+session.pending_order+'\nBitte sende jetzt die vollständige Bitcoin-Transaktions-ID (TXID) als nächste Nachricht. Die Zahlung bleibt bis zur manuellen Prüfung offen.'});
    }else{
      await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Es wurde keine offene Bestellung mit ausstehender TXID gefunden. Öffne den Shop und schließe zuerst eine Bestellung ab.',reply_markup:{inline_keyboard:[[{text:'🛍 Shop öffnen',callback_data:'menu'}]]}});
    }
   }
   else if(data==='menu')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:'Wähle Produkte:',reply_markup:productKeyboard()});
   else if(data==='cart')await tg('editMessageText',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,text:cartText(session.cart),reply_markup:cartKeyboard(session.cart)});
   else if(data==='membership:start'){session.state='membership_name';session.application_data={};await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'MITGLIEDSCHAFTSVERFAHREN\nBitte fülle die Bewerbung vollständig aus. Die Angaben werden zur Prüfung an die Administration übermittelt.\n\n'+applicationPrompts[session.state],reply_markup:{inline_keyboard:[[{text:'Bewerbung abbrechen',callback_data:'membership:cancel'}]]}});}
   else if(data==='membership:cancel'){session.state='cart';session.application_data={};await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Die Bewerbung wurde abgebrochen. Du kannst sie jederzeit erneut starten.',reply_markup:welcomeKeyboard()});}
   else if(data==='txid:submit'){
    if(session.state==='txid'&&session.pending_order)await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Bitte sende jetzt die vollständige Bitcoin-Transaktions-ID (TXID) als Nachricht.'});
    else await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Keine offene Bestellung mit TXID.'});
   }
   else if(data==='noop'){}
   else if(data==='checkout'){if(!cartRows(session.cart).length)await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Warenkorb ist leer.'});else{session.state='name';await saveSession(session);await tg('sendMessage',{chat_id:cb.message.chat.id,text:'Bitte gib deinen vollständigen Namen ein, um die Bestellung anzulegen.'});}}
   else if(data.startsWith('paid:')||data.startsWith('reject:')){
    if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID)){await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});}
    else {const id=data.slice(data.indexOf(':')+1),paid=data.startsWith('paid:');await pool.query('UPDATE shop_orders SET status=$1,paid_at=CASE WHEN $2 THEN now() ELSE paid_at END WHERE order_number=$3',[paid?'paid':'payment_rejected',paid,id]);const order=await getOrder(id);if(order?.telegram_chat_id){if(paid)await tg('sendMessage',{chat_id:order.telegram_chat_id,text:'Zahlung für '+id+' wurde nach manueller Prüfung bestätigt. Deine Rechnung ist verfügbar.',reply_markup:{inline_keyboard:[[{text:'🧾 Rechnung öffnen',url:origin+'/api/shop/invoice/'+id}]]}});else await tg('sendMessage',{chat_id:order.telegram_chat_id,text:'Zahlung für '+id+' wurde nicht bestätigt. Bitte kontaktiere den Support unter @Rothshild_Adriano.'});}await tg('answerCallbackQuery',{callback_query_id:cb.id,text:paid?'Zahlung bestätigt':'Abgelehnt'});}
   }
   else if(data.startsWith('review:')){if(String(cb.from.id)!==String(process.env.TELEGRAM_ADMIN_USER_ID))await tg('answerCallbackQuery',{callback_query_id:cb.id,text:'Nicht autorisiert.'});else{const order=await getOrder(data.slice(7));await tg('sendMessage',{chat_id:cb.message.chat.id,text:order?'Bestellung '+order.order_number+'\nStatus: '+order.status+'\nTXID: '+(order.txid||'noch keine'):'Bestellung nicht gefunden.'});}}
   await tg('answerCallbackQuery',{callback_query_id:cb.id});
  }
  res.sendStatus(200);
 }catch(e){console.error('Telegram webhook error:',e.stack||e.message);res.sendStatus(500);}
});
app.post('/api/shop/orders',rateLimit({windowMs:60*60*1000,limit:8}),async(req,res)=>{
 try{
  const name=clean(req.body?.customerName,100),email=clean(req.body?.customerEmail,254).toLowerCase(),address=clean(req.body?.customerAddress,500),raw=Array.isArray(req.body?.items)?req.body.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||raw.length<1||raw.length>20)return res.status(400).json({error:'Name, gültige E-Mail und Warenkorb erforderlich.'});
  const items=[];for(const item of raw){const p=catalog.find(p=>p.name===clean(item.name,100)),qty=Number(item.quantity);if(!p||!Number.isInteger(qty)||qty<1||qty>25)return res.status(400).json({error:'Ungültiges Produkt oder Menge.'});items.push({...p,quantity:qty,lineTotal:p.price*qty});}
  const total=items.reduce((s,i)=>s+i.lineTotal,0),id=orderId(),order={id,name,email,address,chatId:null,items,total,status:'awaiting_txid'};
  await saveOrder(order);await adminOrder(order);res.status(201).json({ok:true,orderNumber:id,total,status:order.status,txidUrl:origin+'/api/shop/txid/'+id});
 }catch(e){console.error('Web order failed:',e.message);res.status(500).json({error:'Bestellung konnte nicht gespeichert oder übermittelt werden.'});}
});
app.post('/api/shop/txid/:id',async(req,res)=>{
 const txid=clean(req.body?.txid,300);if(txid.length<8)return res.status(400).json({error:'TXID ist zu kurz.'});
 try{const r=await pool.query("UPDATE shop_orders SET txid=$1,status='txid_submitted' WHERE order_number=$2 AND status IN ('awaiting_txid','txid_submitted') RETURNING *",[txid,clean(req.params.id,40)]);if(!r.rowCount)return res.status(404).json({error:'Bestellung nicht gefunden oder bereits abgeschlossen.'});const o=r.rows[0];await tg('sendMessage',{chat_id:adminChatTarget(),text:'TXID für Webbestellung '+o.order_number+'\nKunde: '+o.customer_name+' ('+o.customer_email+')\nTXID: '+txid+'\nGesamt: '+money(o.total)+'\nBitte manuell prüfen.',reply_markup:{inline_keyboard:[[{text:'Zahlung bestätigen',callback_data:'paid:'+o.order_number},{text:'Ablehnen',callback_data:'reject:'+o.order_number}]]}});res.json({ok:true,status:'txid_submitted'});}catch(e){console.error(e.message);res.status(500).json({error:'TXID konnte nicht gespeichert werden.'});}
});
app.get('/api/shop/invoice/:id',async(req,res)=>{try{const o=await getOrder(clean(req.params.id,40));if(!o||o.status!=='paid')return res.status(404).send('Rechnung erst nach bestätigter Zahlung verfügbar.');const lines=o.items.map(i=>'<tr><td>'+escapeHtml(i.name)+'</td><td>'+i.quantity+'</td><td>'+money(i.lineTotal)+'</td></tr>').join('');res.type('html').send('<!doctype html><html lang="de"><meta charset="utf-8"><title>Rechnung '+o.order_number+'</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px;color:#222}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ccc;text-align:left}.actions{margin:20px 0}@media print{.actions{display:none}}</style><h1>Rechnung</h1><p>ROTHSHILD · Order of Light</p><p>Rechnungsnummer: '+o.order_number+'<br>Kunde: '+escapeHtml(o.customer_name)+'<br>Datum: '+new Date(o.paid_at).toLocaleDateString('de-DE')+'</p><table><thead><tr><th>Artikel</th><th>Menge</th><th>Betrag</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Gesamt: '+money(o.total)+'</h2><p>Zahlungsstatus: bezahlt</p><div class="actions"><button onclick="window.print()">Drucken / Als PDF speichern</button></div></html>');}catch(e){res.status(500).send('Rechnung konnte nicht geladen werden.');}});
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
