(()=>{
'use strict';
const shop=document.querySelector('#shop');
if(!shop||shop.dataset.cartReady)return;
shop.dataset.cartReady='1';
const cards=[...shop.querySelectorAll(':scope > .cols > .panel')].filter(card=>card.querySelector('.product-art img'));
const cart=new Map();
let activeOrderNumber=null;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>'$'+Number(value).toFixed(2);
function orderNumber(){
 if(activeOrderNumber)return activeOrderNumber;
 const bytes=new Uint8Array(3);
 if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);else for(let i=0;i<3;i++)bytes[i]=Math.floor(Math.random()*256);
 const suffix=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 activeOrderNumber='RO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+suffix;
 return activeOrderNumber;
}
function items(){return [...cart.values()]}
function total(){return items().reduce((sum,item)=>sum+item.price*item.quantity,0)}
const cartBox=document.createElement('section');
cartBox.className='cart-box';
cartBox.id='shopping-cart';
cartBox.innerHTML=`
<h3>Warenkorb</h3><div id="cart-lines">Noch keine Produkte ausgewählt.</div>
<p><strong>Warenwert: <span id="cart-total">$0.00</span></strong></p>
<p class="muted">Versandkosten und endgültiger Preis werden vor einer Zahlungsaufforderung bestätigt. Diese Anfrage ist noch keine Zahlung.</p>
<form class="cart-form" id="cart-customer">
<label>Name<input name="name" autocomplete="name" required minlength="2" placeholder="Vor- und Nachname"></label>
<label>E-Mail<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
<div class="cart-buttons">
<button class="gold" type="button" id="cart-email">Bestellnachricht per E-Mail öffnen</button>
<button class="gold" type="button" id="cart-telegram">Bestellung an Telegram übermitteln</button>
<a class="outline" href="https://t.me/Rotshild_Adriano" target="_blank" rel="noopener noreferrer">Telegram-Bot öffnen</a>
</div>
<p class="cart-status" id="cart-status" role="status" aria-live="polite"></p>
</form>`;
const notice=shop.querySelector('.notice');
if(notice)shop.insertBefore(cartBox,notice);else shop.append(cartBox);
function render(){
 const lines=document.querySelector('#cart-lines');
 if(!cart.size){lines.textContent='Noch keine Produkte ausgewählt.';}
 else lines.innerHTML=items().map(item=>`<div class="cart-row"><span>${escapeHtml(item.name)}</span><div class="cart-actions"><button type="button" data-dec="${escapeHtml(item.name)}" aria-label="Menge verringern">−</button><span>${item.quantity}</span><button type="button" data-inc="${escapeHtml(item.name)}" aria-label="Menge erhöhen">+</button></div><strong class="cart-price">${money(item.price*item.quantity)}</strong></div>`).join('');
 document.querySelector('#cart-total').textContent=money(total());
 lines.querySelectorAll('[data-inc]').forEach(button=>button.addEventListener('click',()=>change(button.dataset.inc,1)));
 lines.querySelectorAll('[data-dec]').forEach(button=>button.addEventListener('click',()=>change(button.dataset.dec,-1)));
 document.querySelector('#cart-status').textContent='';
}
function change(name,delta){
 const item=cart.get(name);if(!item)return;
 item.quantity+=delta;if(item.quantity<1)cart.delete(name);else item.quantity=Math.min(25,item.quantity);
 activeOrderNumber=null;render();
}
cards.forEach(card=>{
 const name=card.querySelector('h3')?.textContent.trim();
 const priceText=card.querySelector('strong')?.textContent||'';
 const price=Number(priceText.replace(/[^0-9.]/g,''));
 if(!name||!Number.isFinite(price)||price<=0)return;
 const button=document.createElement('button');
 button.type='button';button.className='cart-add';button.textContent='In den Warenkorb';
 button.addEventListener('click',()=>{
  const item=cart.get(name)||{name,price,quantity:0};
  item.quantity=Math.min(25,item.quantity+1);cart.set(name,item);activeOrderNumber=null;render();
  document.querySelector('#cart-status').textContent=name+' wurde hinzugefügt.';
 });
 const holder=document.createElement('p');holder.append(button);card.append(holder);
});
function orderText(id,name,email){
 return [
  'Bestellanfrage – ROTHSHILD · Order of Light','',
  'Bestellnummer: '+id,'Name: '+name,'E-Mail: '+email,'',
  ...items().map(item=>item.name+' × '+item.quantity+' — '+money(item.price*item.quantity)),
  '','Warenwert: '+money(total()),'',
  'Bitte Verfügbarkeit, Versandkosten und Endpreis bestätigen.',
  'Dies ist eine Bestellanfrage, keine Zahlungsbestätigung.'
 ].join('\n');
}
function customer(){
 const form=document.querySelector('#cart-customer');
 if(!cart.size){document.querySelector('#cart-status').textContent='Bitte zuerst Produkte in den Warenkorb legen.';return null;}
 if(!form.reportValidity())return null;
 const data=new FormData(form);
 return {name:String(data.get('name')).trim(),email:String(data.get('email')).trim()};
}
document.querySelector('#cart-email').addEventListener('click',()=>{
 const c=customer();if(!c)return;
 const id=orderNumber(),subject='Bestellanfrage '+id;
 const body=orderText(id,c.name,c.email);
 window.location.href='mailto:adiphenex@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 document.querySelector('#cart-status').textContent='E-Mail-Entwurf mit Bestellnummer '+id+' wurde angefordert. Bitte im E-Mail-Programm noch absenden.';
});
document.querySelector('#cart-telegram').addEventListener('click',async()=>{
 const c=customer();if(!c)return;
 const id=orderNumber(),status=document.querySelector('#cart-status'),button=document.querySelector('#cart-telegram');
 button.disabled=true;status.textContent='Übermittle Bestellnummer '+id+' an Telegram …';
 try{
  const response=await fetch('https://rothshild-order-api.onrender.com/api/shop/orders',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:id,customerName:c.name,customerEmail:c.email,items:items().map(item=>({name:item.name,quantity:item.quantity}))})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Telegram-Übermittlung fehlgeschlagen.');
  status.textContent='Bestellung '+data.orderNumber+' wurde an Telegram übermittelt. Warenwert: '+money(data.total)+'. Zahlung noch offen.';
  const txidBox=document.createElement('div');
  txidBox.className='txid-entry';
  txidBox.innerHTML='<label>Transaktions-ID (TXID)<input id="shop-txid" maxlength="300" required placeholder="TXID nach der Zahlungsanweisung"></label><button class="gold" type="button" id="submit-shop-txid">TXID übermitteln</button><p class="muted">Die Zahlung gilt erst nach Prüfung durch die Administration als bestätigt.</p>';
  status.appendChild(txidBox);
  document.querySelector('#submit-shop-txid').addEventListener('click',async()=>{
   const txid=document.querySelector('#shop-txid').value.trim(),txButton=document.querySelector('#submit-shop-txid');
   if(txid.length<8){status.insertAdjacentText('beforeend',' Bitte eine vollständige TXID eingeben.');return;}
   txButton.disabled=true;
   try{
    const txResponse=await fetch('https://rothshild-order-api.onrender.com/api/shop/txid/'+encodeURIComponent(data.orderNumber),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({txid})});
    const txData=await txResponse.json().catch(()=>({}));
    if(!txResponse.ok)throw new Error(txData.error||'TXID konnte nicht übermittelt werden.');
    txidBox.innerHTML='<p>TXID wurde zur Prüfung an die Administration gesendet. Zahlung noch nicht bestätigt.</p>';
   }catch(e){status.insertAdjacentText('beforeend',' '+e.message);txButton.disabled=false;}
  });
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});
render();
})();