(()=>{'use strict';
const key='roths-order-draft';
let o;
try{o=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
const box=document.querySelector('#invoice');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
const date=o?.orderCreatedAt?new Date(o.orderCreatedAt):new Date();
const dateLabel=isNaN(date.getTime())?'—':date.toLocaleString('de-DE',{dateStyle:'long',timeStyle:'short'});
if(!box)return;
if(!o||!o.orderNumber){
 box.innerHTML='<p>Keine übermittelte Bestellanfrage gefunden. <a href="/shop.html">Zum Shop</a></p>';
}else{
 const items=Array.isArray(o.items)?o.items:[];
 const total=items.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.quantity||0),0);
 const rows=items.map(i=>'<tr><td>'+esc(i.name)+'</td><td>'+money(i.price)+'</td><td>'+Number(i.quantity||0)+'</td><td>'+money(Number(i.price||0)*Number(i.quantity||0))+'</td></tr>').join('');
 box.innerHTML='<div class="order-document" id="print-order"><div class="order-document-head"><div><p class="eyebrow">ROTHSHILD · ORDER OF LIGHT</p><h2>Bestellübersicht</h2><p>Unverbindliche Bestellanfrage – keine Zahlungsbestätigung oder steuerrechtliche Rechnung.</p></div><div class="order-number"><small>BESTELLNUMMER</small><strong>'+esc(o.orderNumber)+'</strong><small>Erstellt: '+esc(dateLabel)+'</small></div></div><hr><h3>Kundendaten</h3><p><b>Name:</b> '+esc(o.customerName)+'<br><b>E-Mail:</b> '+esc(o.customerEmail)+'<br><b>Lieferadresse:</b><br>'+esc(o.customerAddress).replace(/\n/g,'<br>')+'</p><h3>Bestellte Artikel</h3><table><thead><tr><th>Artikel</th><th>Einzelpreis</th><th>Menge</th><th>Summe</th></tr></thead><tbody>'+rows+'</tbody></table><div class="order-total"><span>Warenwert</span><strong>'+money(total)+'</strong></div><p><b>Versandkosten:</b> werden noch bestätigt<br><b>Endpreis:</b> noch offen<br><b>Status:</b> Bestellanfrage eingegangen – Verfügbarkeit und Preisprüfung ausstehend.</p><p class="muted">Bitte erst nach schriftlicher Bestätigung des endgültigen Gesamtpreises bezahlen.</p></div>';
 const actions=document.createElement('div');actions.className='order-actions';actions.innerHTML='<button type="button" id="print-order-button" class="outline">Bestellübersicht drucken / als PDF speichern</button>';
 box.appendChild(actions);
 const note=document.createElement('p');
 note.textContent=o.emailSent?'Die Bestell-E-Mail wurde vom Server versendet.':'Die E-Mail ist vorbereitet. Prüfe die vollständig ausgefüllte Nachricht in deiner E-Mail-App und sende sie selbst ab.';
 note.setAttribute('role','status');box.appendChild(note);
 const mail=document.querySelector('#email-order');
 if(mail){
  const body=[
   'ROTHSHILD · ORDER OF LIGHT',
   'BESTELLÜBERSICHT / UNVERBINDLICHE BESTELLANFRAGE',
   'Bestellnummer: '+o.orderNumber,
   'Erstellt am: '+dateLabel,
   '',
   'KUNDENDATEN',
   'Name: '+(o.customerName||''),
   'E-Mail: '+(o.customerEmail||''),
   'Lieferadresse: '+(o.customerAddress||''),
   '',
   'BESTELLTE ARTIKEL',
   'Artikel | Einzelpreis | Menge | Summe',
   ...items.map(i=>i.name+' | '+money(i.price)+' | '+i.quantity+' | '+money(Number(i.price||0)*Number(i.quantity||0))),
   '',
   'Warenwert: '+money(total),
   'Versandkosten: werden noch bestätigt',
   'Endpreis: noch offen',
   'Status: Unverbindliche Bestellanfrage; Verfügbarkeit und Preisprüfung ausstehend.',
   '',
   'Bitte bestätigen Sie Verfügbarkeit, Versandkosten und den endgültigen Gesamtpreis schriftlich.',
   'Diese Bestellübersicht ist keine steuerrechtliche Rechnung und keine Zahlungsbestätigung.',
   '',
   'Vielen Dank.'
  ].join('\n');
  mail.href='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent('ROTHSHILD Bestellübersicht '+o.orderNumber)+'&body='+encodeURIComponent(body);
  mail.textContent='Bestellübersicht per E-Mail weiterleiten';
 }
 document.querySelector('#print-order-button')?.addEventListener('click',()=>window.print());
}
const telegram=document.querySelector('#telegram-order');
if(telegram){telegram.href='https://t.me/Rothshild_Bot';telegram.textContent='Zum Telegram-Bot @Rothshild_Bot';telegram.target='_blank';telegram.rel='noopener noreferrer';}
})();