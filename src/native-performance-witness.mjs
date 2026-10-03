// Only render frames count. Reconstruction, missing starts and skipped clip time cannot earn money.
export function createNativePerformanceWitness(){
 let state=null;
 return {
  reset(){state=null;},
  observe({id,seq,activity,duration,t,dt,rendered,weight,music}){
   if(!id){state=null;return;}
   if(!state||state.id!==id||state.seq!==seq)state={id,seq,activity,duration,lastT:0,renderedMs:0,valid:t<=.08,complete:false};
   if(state.complete)return;
   const delta=Math.max(0,Math.min(t,duration)-Math.min(state.lastT,duration));
   if(activity!==state.activity||duration!==state.duration||t<state.lastT||delta>.101||delta>dt+.001||!rendered||!music||(delta>0&&weight<=0))state.valid=false;
   if(rendered&&music&&weight>0)state.renderedMs+=Math.min(delta,.1,Math.max(0,dt))*1000;
   state.lastT=t;state.complete=t>=duration&&state.valid&&state.renderedMs>=duration*1000-80;
  },
  snapshot(){return state?{id:state.id,activity:state.activity,duration:state.duration,renderedMs:state.renderedMs,complete:state.complete}:null;}
 };
}
