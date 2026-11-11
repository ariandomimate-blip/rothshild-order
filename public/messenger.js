const $=s=>document.querySelector(s);
let me=null,profiles=[],selected=new Set(),currentChat=null,lastIds=new Set(),polling=false;
async function api(path,opts={}){
 const r=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');
 return d;
}
function safeText(s){return String(s??'')}
function renderMembers(){
 const host=$('#members');host.replaceChildren();
 const term=$('#memberSearch').value.trim().toLocaleLowerCase();
 const shown=profiles.filter(p=>p&&p.id&&p.id!==me?.id&&[p.display_name,p.bio,p.rank,p.title].map(safeText).join(' ').toLocaleLowerCase().includes(term));
 if(!shown.length){host.textContent='Keine weiteren freigeschalteten Mitglieder gefunden.';return}
 shown.forEach(p=>{
  const b=document.createElement('button');b.type='button';b.className='member';b.setAttribute('aria-pressed',String(selected.has(p.id)));
  b.style.borderColor=selected.has(p.id)?'#d6b66d':'#49371e';
  const img=document.createElement(p.avatar_data?'img':'span');img.className='avatar';
  if(p.avatar_data)img.src=p.avatar_data;else img.textContent=(p.display_name||'?').slice(0,1).toUpperCase();
  const info=document.createElement('span'),name=document.createElement('strong'),sub=document.createElement('small');
  name.textContent=p.display_name||'Mitglied';sub.textContent=[p.title,p.rank].filter(Boolean).join(' · ')||'Freigeschaltetes Mitglied';
  info.append(name,sub);b.append(img,info);
  b.addEventListener('click',()=>{if(selected.has(p.id))selected.delete(p.id);else selected.add(p.id);renderMembers()});
  host.append(b);
 });
}
async function loadProfiles(){
 const data=await api('/profiles');
 // The API returns { profiles: [...] }; normalize both the object and legacy array shape.
 profiles=Array.isArray(data)?data:(Array.isArray(data?.profiles)?data.profiles:[]);
 selected=new Set([...selected].filter(id=>profiles.some(p=>p.id===id)));
 renderMembers();
 $('#memberStatus').textContent=profiles.filter(p=>p.id!==me.id).length+' freigeschaltete Mitglieder';
}
async function loadChats(){
 const data=await api('/member-chats'),rows=Array.isArray(data)?data:[];
 const host=$('#chats');host.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='Noch keine Chats vorhanden.';host.append(p);return rows}
 rows.forEach(c=>{
  const b=document.createElement('button');b.type='button';b.className='chat-item';
  b.textContent=(c.id===currentChat?'✓ ':'✧ ')+(c.chat_name||'Mitglieder-Chat');
  b.setAttribute('aria-current',String(c.id===currentChat));
  b.addEventListener('click',()=>openChat(c));host.append(b);
 });
 return rows;
}
function addBubble(m){
 const el=document.createElement('div');el.className='bubble'+(m.senderId===me.id?' mine':'');el.textContent=m.text;$('#messages').append(el);
}
async function openChat(chat){
 if(!chat?.id)return;
 currentChat=chat.id;lastIds.clear();
 $('#chatTitle').textContent=chat.chat_name||'Mitglieder-Chat';
 $('#chatSub').textContent='Aktiver Chat · freigeschaltete Mitglieder';
 $('#messages').replaceChildren();
 $('#sendStatus').textContent='';
 await loadMessages(true);await loadChats();
}
async function loadMessages(reset=false){
 if(!currentChat)return;
 try{
  const data=await api('/member-chats/'+encodeURIComponent(currentChat)+'/messages');
  const rows=Array.isArray(data)?data:[];
  if(reset){$('#messages').replaceChildren();lastIds.clear()}
  const box=$('#messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
  rows.forEach(m=>{if(!lastIds.has(m.id)){lastIds.add(m.id);addBubble(m)}});
  if(nearBottom)box.scrollTop=box.scrollHeight;
 }catch(e){$('#sendStatus').textContent=e.message}
}
async function refresh(){
 try{
  const chats=await loadChats();
  if(currentChat&&!chats.some(c=>c.id===currentChat)){
   currentChat=null;lastIds.clear();$('#messages').replaceChildren();
   $('#chatTitle').textContent='Chat auswählen';$('#chatSub').textContent='Wähle links einen bestehenden Chat aus.';
  }
  await loadMessages(false);
 }catch(e){$('#sendStatus').textContent=e.message}
}
$('#startSelected').addEventListener('click',async()=>{
 const ids=[...selected];
 if(!ids.length){$('#memberStatus').textContent='Bitte zuerst ein oder mehrere Mitglieder auswählen.';return}
 const b=$('#startSelected');b.disabled=true;
 try{
  const r=await api('/member-chats',{method:'POST',body:JSON.stringify({memberIds:ids})});
  selected.clear();renderMembers();
  const chats=await loadChats(),chat=chats.find(c=>c.id===r.id);
  if(chat)await openChat(chat);else await refresh();
  $('#memberStatus').textContent='Chat wurde erstellt. Du kannst jetzt Nachrichten senden.';
 }catch(e){$('#memberStatus').textContent=e.message}
 finally{b.disabled=false}
});
$('#sendForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!currentChat){$('#sendStatus').textContent='Bitte zuerst einen Chat auswählen.';return}
 const text=$('#messageText').value.trim();if(!text)return;
 const b=$('#sendForm button');b.disabled=true;
 try{
  const m=await api('/member-chats/'+encodeURIComponent(currentChat)+'/messages',{method:'POST',body:JSON.stringify({text})});
  if(!lastIds.has(m.id)){lastIds.add(m.id);addBubble(m)}
  $('#messageText').value='';$('#sendStatus').textContent='Nachricht gesendet.';
  $('#messages').scrollTop=$('#messages').scrollHeight;await loadChats();
 }catch(err){$('#sendStatus').textContent=err.message}
 finally{b.disabled=false}
});
$('#memberSearch').addEventListener('input',renderMembers);
$('#refresh').addEventListener('click',async()=>{
 const b=$('#refresh');b.disabled=true;
 try{await loadProfiles();await refresh()}catch(e){$('#memberStatus').textContent=e.message}
 finally{b.disabled=false}
});
async function init(){
 try{
  me=(await api('/me')).user;
  if(me.status!=='approved')throw Error('Dein Mitgliederzugang ist noch nicht freigeschaltet.');
  await loadProfiles();await refresh();
  setInterval(()=>{if(document.visibilityState==='visible'&&!polling){polling=true;refresh().finally(()=>polling=false)}},4000);
 }catch(e){
  $('#memberStatus').textContent=e.message;
  $('#chatSub').textContent='Bitte melde dich mit einem freigeschalteten Rothshild-Mitgliedskonto an.';
  $('#sendForm').hidden=true;
 }
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&me)refresh()});
init();
