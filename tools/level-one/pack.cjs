'use strict';
const WireMedia=(()=>{
 const alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;:=>?@^_`{|}~",index=new Uint8Array(128);
 for(let i=0;i<alphabet.length;i++)index[alphabet.charCodeAt(i)]=i;
 function bytes(s){
  const buffer=new Uint8Array(Math.floor(s.length*4/5));
  for(let p=0,q=0;p<s.length;){
   const len=Math.min(5,s.length-p);
   let value=0;
   for(let j=0;j<5;j++)value=value*85+(j<len?index[s.charCodeAt(p+j)]:84);
   for(let j=0;j<len-1;j++)buffer[q++]=value>>>(24-j*8);
   p+=len;
  }
  return buffer;
 }
 function image(s){
  const b=bytes(s);
  let bin='';
  for(let i=0;i<b.length;i+=8192)bin+=String.fromCharCode(...b.subarray(i,i+8192));
  return 'data:image/webp;base64,'+btoa(bin);
 }
 return {bytes,image};
})();
module.exports=WireMedia;
