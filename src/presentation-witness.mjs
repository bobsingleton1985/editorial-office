// The first streamed pose may arrive a fraction into a clip. Missing time is
// never credited. Preserve the existing 80ms start/end tolerance, and invalidate
// skipped or hidden display frames. This measures presentation, not simulation.
export function createPresentationWitness(){
  let state=null;
  return {
    reset(){state=null;},
    observe({id,seq,activity,duration,t,dt,rendered,weight,music}){
      if(!id){state=null;return;}
      if(!state||state.id!==id||state.seq!==seq){state={id,seq,activity,duration,lastT:t,renderedMs:0,valid:t<=.08,complete:false,reason:t>.08?'late_start':null};}
      if(state.complete)return;
      const delta=Math.max(0,Math.min(t,duration)-Math.min(state.lastT,duration));
      if(activity!==state.activity||duration!==state.duration||t<state.lastT||delta>.101||delta>dt+.002||!rendered||!music||(delta>0&&weight<=0)){state.valid=false;state.reason??={t,delta,dt,rendered,music,weight};}
      if(rendered&&music&&weight>0)state.renderedMs+=Math.min(delta,.1,Math.max(0,dt))*1000;
      state.lastT=t;state.complete=t>=duration&&state.valid&&state.renderedMs>=duration*1000-80;
    },
    debug:()=>state,
    snapshot(){return state?{id:state.id,activity:state.activity,duration:state.duration,renderedMs:state.renderedMs,complete:state.complete}:null;},
  };
}
