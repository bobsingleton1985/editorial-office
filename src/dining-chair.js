import {DINING_CHAIR,DESKS} from './layout.js';
export function addDiningChair(office){
 if(office.getObjectByName('DINING_CHAIR_N_|_ANCHOR'))return;
 const source=office.getObjectByName('CHAIR_v02_|_ANCHOR');if(!source)throw Error('Dining chair requires accepted source chair A');
 const node=source.clone(true);node.traverse((o)=>{o.name='DINING_N_|_'+o.name;});node.name='DINING_CHAIR_N_|_ANCHOR';
 node.position.set(DINING_CHAIR.x,0,DINING_CHAIR.z+(-2.49566388130188-DESKS.A.z));node.rotation.set(0,0,0);office.add(node);office.updateMatrixWorld(true);return node;
}
