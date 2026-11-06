'use strict';
const WalkAccess=(()=>{
 const demoCodes=Object.freeze({staff:'0417',serviceLift:'0624'});
 const matches=(scope,code)=>Object.hasOwn(demoCodes,scope)&&demoCodes[scope]===code.trim();
 const entry=(grants,room)=>room!=='staff'||grants.has('staff');
 const operate=grants=>grants.has('staff');
 const ride=grants=>grants.has('staff')&&grants.has('serviceLift');
 return {matches,entry,operate,ride};
})();
module.exports=WalkAccess;
