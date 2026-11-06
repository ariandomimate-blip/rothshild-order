(()=>{'use strict';
const key='roths-order-draft';
let o;
try{o=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
const box=document.querySelector('#invoice');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(!box)return;
if(!o||!o.orderNumber){
 box.innerHTML='<p>Keine übermittelte Bestellanfrage gefunden. <a href="/shop.html">Zum Shop</a></p>';
}else{
 const items=Array.isArray(o.items)?o.items:[];
 box.innerHTML='<h2>Bestellnummer '+esc(o.orderNumber)+'</h2><p><b>Name:</b> '+esc(o.customerName)+'<br><b>E-Mail:</b> '+esc(o.customerEmail)+'<br><b>Lieferadresse:</b> '+esc(o.customerAddress)+'</p><table><thead><tr><th>Produkt</th><th>Menge</th><th>Summe</th></tr></thead><tbody>'+items.map(i=>'<tr><td>'+esc(i.name)+'</td><td>'+Number(i.quantity||0)+'</td><td>$'+(Number(i.price||0)*Number(i.quantity||0)).toFixed(2)+'</td></tr>').join('')+'</tbody></table><h2>Warenwert: $'+Number(o.total||0).toFixed(2)+'</h2><section class="payment-wallet"><h2>Bitcoin-Zahlung (BTC)</h2><p>Nachfolgend finden Sie die Adresse, an die Sie Ihre Zahlung leisten sollen:</p><p class="wallet-address"><code>12RFpbxvFpWSzk6H3Y4faNRTf9vTzfVKPF</code></p><button type="button" id="copy-wallet">Wallet-Adresse kopieren</button><p>Bitte überweisen Sie erst nach Bestätigung des Endpreises und prüfen Sie die Adresse vor dem Senden. Die Zahlung gilt erst nach manueller Prüfung als bestätigt.</p></section><p>Status: Bestellanfrage übermittelt. Diese Übersicht ist keine Zahlungsbestätigung oder steuerliche Rechnung. Versandkosten und Endpreis werden noch bestätigt.</p>';
 const note=document.createElement('p');
 note.textContent=o.emailSent?'Die Bestell-E-Mail wurde vom Server versendet.':'Die E-Mail ist vorbereitet. Über den Button öffnet sich deine E-Mail-App mit allen Bestelldaten. Du kannst die Nachricht prüfen und selbst absenden.';
 note.setAttribute('role','status');
 box.appendChild(note);
 const mail=document.querySelector('#email-order');
 if(mail){
  const subject='ROTHSHILD Shop-Bestellung '+o.orderNumber;
  const body=[
   'Guten Tag,',
   '',
   'hiermit leite ich meine Bestellanfrage weiter.',
   'Bestellnummer: '+o.orderNumber,
   'Name: '+(o.customerName||''),
   'E-Mail des Kunden: '+(o.customerEmail||''),
   'Lieferadresse: '+(o.customerAddress||''),
   '',
   'Bestellte Artikel:',
   ...items.map(i=>i.name+' × '+i.quantity+' — $'+(Number(i.price||0)*Number(i.quantity||0)).toFixed(2)),
   '',
   'Warenwert: $'+Number(o.total||0).toFixed(2),
   '',
   'Bitte bestätigen Sie Verfügbarkeit, Versandkosten und den endgültigen Gesamtpreis.',
   '',
   'Vielen Dank.'
  ].join('\n');
  mail.href='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  mail.textContent='Bestellung per E-Mail weiterleiten';
  mail.setAttribute('aria-label','Vorbereitete Bestell-E-Mail an rothschildofficial938@gmail.com öffnen. Versand erfolgt erst nach Bestätigung durch den Nutzer.');
 }
}
const telegram=document.querySelector('#telegram-order');
if(telegram){
 telegram.href='https://t.me/Rothshild_Bot';
 telegram.textContent='Zum Telegram-Bot @Rothshild_Bot';
 telegram.target='_blank';
 telegram.rel='noopener noreferrer';
 telegram.setAttribute('aria-label','Telegram-Bot @Rothshild_Bot öffnen');
}
document.querySelector('#copy-wallet')?.addEventListener('click',async()=>{
 const b=document.querySelector('#copy-wallet');
 try{await navigator.clipboard.writeText('12RFpbxvFpWSzk6H3Y4faNRTf9vTzfVKPF');b.textContent='Adresse kopiert';}
 catch{b.textContent='Bitte Adresse manuell kopieren';}
});
})();