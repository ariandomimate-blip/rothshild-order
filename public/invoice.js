(()=>{'use strict';
const key='roths-order-draft';
let o;
try{o=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
const box=document.querySelector('#invoice');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
const date=o?.orderCreatedAt?new Date(o.orderCreatedAt):new Date();
const dateLabel=isNaN(date.getTime())?'—':date.toLocaleString('en-US',{dateStyle:'long',timeStyle:'short'});
if(!box)return;
if(!o||!o.orderNumber){
 box.innerHTML='<p>No submitted order request was found. <a href="/shop.html">Back to shop</a></p>';
}else{
 const items=Array.isArray(o.items)?o.items:[];
 const total=items.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.quantity||0),0);
 const rows=items.map(i=>'<tr><td>'+esc(i.name)+'</td><td>'+money(i.price)+'</td><td>'+Number(i.quantity||0)+'</td><td>'+money(Number(i.price||0)*Number(i.quantity||0))+'</td></tr>').join('');
 box.innerHTML='<div class="order-document" id="print-order"><div class="order-document-head"><div><p class="eyebrow">ROTHSHILD · ORDER OF LIGHT</p><h2>Order Summary</h2><p>Non-binding order request — not a payment confirmation or tax invoice.</p></div><div class="order-number"><small>ORDER NUMBER</small><strong>'+esc(o.orderNumber)+'</strong><small>Created: '+esc(dateLabel)+'</small></div></div><hr><h3>Customer Details</h3><p><b>Name:</b> '+esc(o.customerName)+'<br><b>Email:</b> '+esc(o.customerEmail)+'<br><b>Shipping address:</b><br>'+esc(o.customerAddress).replace(/\n/g,'<br>')+'</p><h3>Ordered Items</h3><table><thead><tr><th>Item</th><th>Unit Price</th><th>Quantity</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><div class="order-total"><span>Subtotal</span><strong>'+money(total)+'</strong></div><p><b>Shipping:</b> to be confirmed<br><b>Final price:</b> pending<br><b>Status:</b> Order request received — availability and price review pending.</p><p class="muted">Please do not pay until the final total has been confirmed in writing.</p></div>';
 const actions=document.createElement('div');actions.className='order-actions';actions.innerHTML='<button type="button" id="print-order-button" class="outline">Print order summary / Save as PDF</button>';
 box.appendChild(actions);
 const note=document.createElement('p');
 note.textContent=o.emailSent?'The order email was sent by the server.':'The email is ready. Review the completed message in your email app and send it yourself.';
 note.setAttribute('role','status');box.appendChild(note);
 const mail=document.querySelector('#email-order');
 if(mail){
  const body=[
   'ROTHSHILD · ORDER OF LIGHT',
   'ORDER SUMMARY / NON-BINDING ORDER REQUEST',
   'Order number: '+o.orderNumber,
   'Created on: '+dateLabel,
   '',
   'CUSTOMER DETAILS',
   'Name: '+(o.customerName||''),
   'Email: '+(o.customerEmail||''),
   'Shipping address: '+(o.customerAddress||''),
   '',
   'ORDERED ITEMS',
   'Item | Unit price | Quantity | Total',
   ...items.map(i=>i.name+' | '+money(i.price)+' | '+i.quantity+' | '+money(Number(i.price||0)*Number(i.quantity||0))),
   '',
   'Subtotal: '+money(total),
   'Shipping: to be confirmed',
   'Final price: pending',
   'Status: Non-binding order request; availability and price review pending.',
   '',
   'Please confirm availability, shipping costs, and the final total in writing.',
   'This order summary is not a tax invoice or payment confirmation.',
   '',
   'Thank you.'
  ].join('\n');
  mail.href='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent('ROTHSHILD Order Summary '+o.orderNumber)+'&body='+encodeURIComponent(body);
  mail.textContent='Forward order summary by email';
 }
 document.querySelector('#print-order-button')?.addEventListener('click',()=>window.print());
}
const telegram=document.querySelector('#telegram-order');
if(telegram){telegram.href='https://t.me/Rothshild_Bot';telegram.textContent='Open Telegram bot @Rothshild_Bot';telegram.target='_blank';telegram.rel='noopener noreferrer';}
})();