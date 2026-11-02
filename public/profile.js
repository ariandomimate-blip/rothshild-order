const $=s=>document.querySelector(s);let avatarData=null,coverData=null,user=null,profile={};
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d}
function render(v={}){profile=v;$('#socialName').textContent=v.display_name||user?.displayName||user?.display_name||'Mitglied';$('#socialMeta').textContent=[v.rank,v.title].filter(x=>x&&!x.startsWith('Kein ')).join(' · ');$('#socialBio').textContent=v.bio||'Noch keine Beschreibung hinzugefügt.';$('#socialCover').style.backgroundImage=v.cover_data?'linear-gradient(#0002,#0007),url('+JSON.stringify(v.cover_data)+')':'linear-gradient(120deg,#302111,#090807)';$('#socialCover').style.backgroundSize='cover';$('#socialCover').style.backgroundPosition='center';const av=$('#socialAvatar');if(v.avatar_data){av.src=v.avatar_data;av.hidden=false}else{av.removeAttribute('src');av.hidden=true}}
function read(file,cb){if(!file)return;if(file.size>850000){$('#profileMsg').textContent='Bitte ein Bild unter 850 KB wählen.';return}const fr=new FileReader();fr.onload=()=>cb(fr.result);fr.readAsDataURL(file)}
function openEditor(open){$('#profileForm').hidden=!open;$('#editProfileBtn').hidden=open;$('#editProfileBtn').setAttribute('aria-expanded',String(open));if(open)$('#profileForm').scrollIntoView({behavior:'smooth',block:'start'})}
$('#editProfileBtn').onclick=()=>openEditor(true);$('#cancelEditBtn').onclick=()=>openEditor(false);
$('#avatar').onchange=e=>read(e.target.files[0],v=>{avatarData=v;render({...profile,avatar_data:v})});
$('#cover').onchange=e=>read(e.target.files[0],v=>{coverData=v;render({...profile,cover_data:v})});
async function load(){try{user=(await api('/me')).user;const p=(await api('/profile')).profile||{};$('#status').textContent='Profil von '+(user.displayName||user.display_name||user.email);$('#profileCard').hidden=false;const f=$('#profileForm');f.elements.displayName.value=p.display_name||user.displayName||user.display_name||'';f.elements.bio.value=p.bio||'';f.elements.rank.value=p.rank||'Kein Rang angegeben';f.elements.title.value=p.title||'Kein Titel angegeben';avatarData=p.avatar_data||null;coverData=p.cover_data||null;render(p)}catch(e){$('#status').textContent=e.message+' — bitte zuerst anmelden.';$('#profileCard').hidden=true}}
$('#profileForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),msg=$('#profileMsg');msg.textContent='Speichere …';try{await api('/profile',{method:'PATCH',body:JSON.stringify({displayName:f.get('displayName'),bio:f.get('bio'),rank:f.get('rank'),title:f.get('title'),avatarData,coverData})});profile={...profile,display_name:f.get('displayName'),bio:f.get('bio'),rank:f.get('rank'),title:f.get('title'),avatar_data:avatarData,cover_data:coverData};render(profile);msg.textContent='Profil erfolgreich gespeichert.';openEditor(false)}catch(x){msg.textContent=x.message}};
const mentorForm=$('#mentorRequest');if(mentorForm)mentorForm.addEventListener('submit',async e=>{
 e.preventDefault();
 const f=new FormData(mentorForm),out=$('#mentorMsg');
 const topic=String(f.get('topic')||'').trim(),message=String(f.get('message')||'').trim();
 const emailTo='rothschildofficial938@gmail.com';
 const subject='Mentorenanfrage – '+topic;
 const body='Mentorenanfrage über die ROTHSHILD-Community\\n\\nThema: '+topic+'\\n\\nNachricht:\\n'+message+'\\n\\nBitte antworte direkt auf diese E-Mail.';
 const mailto='mailto:'+emailTo+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 try{
  const r=await fetch('/api/mentor/request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,message})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'Anfrage konnte nicht übermittelt werden.');
  out.textContent=d.message||'Mentorenanfrage wurde übermittelt.';
  mentorForm.reset();
 }catch(x){
  out.textContent='Automatischer Versand nicht verfügbar. ';
  const link=document.createElement('a');
  link.href=mailto;link.textContent='E-Mail an Rothshild öffnen (Empfänger, Betreff und Nachricht vorausgefüllt)';
  out.append(link);
 }
});
load();