import {randomUUID} from 'node:crypto';
// A connected stream is not proof that a page remains visible. Presence is
// short-lived, tied to that stream, and independent of performance receipts.
export function createViewerPresence({ttl=6000}={}){
 const entries=new Map();
 return {
  connect(viewer){const lease=randomUUID();entries.set(viewer,{lease,visible:false,at:0});return {lease};},
  disconnect(viewer){entries.delete(viewer);},
  accept(body,now=Date.now()){
   if(typeof body?.visible!=='boolean'||typeof body?.lease!=='string')return false;
   const item=[...entries.values()].find(x=>x.lease===body.lease);
   if(!item)return false;
   item.visible=body.visible;item.at=now;return true;
  },
  count(now=Date.now()){return [...entries.values()].filter(x=>x.visible&&now-x.at>=0&&now-x.at<ttl).length;},
 };
}
