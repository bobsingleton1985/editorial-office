import * as T from 'three';
import {TRAY_SERVICE,trayPlan} from './tray-service-plan.mjs';
const norm=n=>n.toLowerCase().replace(/[^a-z0-9]/g,'');
const PROP_TO_HER=.95928088644;

export function attachTrayService(extra,{pick,put,propsPick,propsPut}){
  extra.nativeClips.push({id:'HER-TRAY-PICK',activity:'tray_pick',label:'берёт поднос',clip:pick.animations[0]},
    {id:'HER-TRAY-PUT',activity:'tray_put',label:'ставит поднос',clip:put.animations[0]});
  const priorFactory=extra.nativePropsFactory;
  extra.nativePropsFactory=args=>{
    const prior=priorFactory(args),container=new T.Group(),group=new T.Group(),scaled=new T.Group();
    container.name='HER service and native props';group.name='HER serving tray';scaled.scale.setScalar(PROP_TO_HER);
    args.scene.add(container);container.add(prior.group,group);group.add(scaled);group.visible=false;
    let source;propsPick.scene.traverse(o=>{if(norm(o.name)==='whiskyservingtray')source=o;});
    if(!source)throw Error('Accepted serving tray missing');
    const tray=source.clone(true);scaled.add(tray);
    const mix=new T.AnimationMixer(scaled),actions={};
    for(const [id,g] of [['HER-TRAY-PICK',propsPick],['HER-TRAY-PUT',propsPut]]){
      const clip=g.animations.find(c=>c.name===(id==='HER-TRAY-PICK'?'tray_pick':'tray_put'));
      actions[id]=mix.clipAction(new T.AnimationClip(id,clip.duration,clip.tracks.filter(t=>norm(t.name.split('.')[0])==='whiskyservingtray')));
      actions[id].setLoop(T.LoopOnce,1);actions[id].clampWhenFinished=true;
    }
    const liquids=[],glasses=[];tray.traverse(o=>{if(/tray_glass_\d/.test(o.name)){glasses.push(o);if(/whisky/.test(o.name))liquids.push(o);}});
    const upper=Object.entries(args.B).filter(([n])=>/^(spine|neck|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(n));
    let held=null,grip=null,controller=null,supportHidden=[],delivered=null;
    const originalGlass=prior.pourGlass;
    const place=(F)=>{group.position.set(F.x,0,F.z);group.rotation.set(0,F.th,0);group.scale.setScalar(args.S);group.updateMatrixWorld(true);};
    function sample(id,t,F){place(F);mix.stopAllAction();const a=actions[id];a.reset().play();a.time=Math.min(t,a.getClip().duration);mix.update(0);group.updateMatrixWorld(true);}
    function fill(n,count){for(const o of glasses){const k=Number(/tray_glass_(\d)/.exec(o.name)[1]);o.visible=k<=count&&(!/whisky/.test(o.name)||k<=n);}}
    function showDock(){sample('HER-TRAY-PICK',0,TRAY_SERVICE.pick);}
    function restore(){if(originalGlass)originalGlass.visible=true;held=null;grip=null;if(!delivered){for(const [o,v]of supportHidden)o.visible=v;supportHidden=[];group.visible=false;}}
    function begin(s){restore();fill(0,s.recipients.length);group.visible=true;showDock();
      args.office.traverse(o=>{if(/^BAR_.*(tray|tumblers_tray)/.test(o.name)){supportHidden.push([o,o.visible]);o.visible=false;}});
    }
    const service={
      group,begin,restore,available:()=>!delivered,delivered:()=>delivered,
      clearDelivery(){delivered=null;restore();},
      restoreDelivery(d){
        if(!d||delivered?.id===d.id)return;
        delivered={id:d.id,recipients:d.recipients,poured:d.poured};fill(d.poured,d.recipients.length);group.visible=true;
        sample('HER-TRAY-PUT',actions['HER-TRAY-PUT'].getClip().duration,TRAY_SERVICE.table);
        if(!supportHidden.length)args.office.traverse(o=>{if(/^BAR_.*(tray|tumblers_tray)/.test(o.name)){supportHidden.push([o,o.visible]);o.visible=false;}});
      },
      setController(c){controller=c;},
      capture(){held=upper.map(([n,b])=>[n,b.position.clone(),b.quaternion.clone()]);args.B.hand_l.updateWorldMatrix(true,false);group.updateMatrixWorld(true);grip=args.B.hand_l.matrixWorld.clone().invert().multiply(group.matrixWorld);},
      post(state,F){
        if(!state)return;
        group.visible=true;fill(state.poured,state.recipients.length);
        if(state.step?.clip==='HER-POUR'){
          // The accepted pour's bottle stays on its existing hand grip. Its standalone glass is hidden; the real tray glasses remain.
          if(originalGlass)originalGlass.visible=false;
          showDock();
        }else if(state.step?.clip&&actions[state.step.clip])sample(state.step.clip,state.t,F);
        else if(state.carrying&&grip){
          for(const [n,p,q]of held){args.B[n].position.copy(p);args.B[n].quaternion.copy(q);}args.root.updateMatrixWorld(true);
          const m=args.B.hand_l.matrixWorld.clone().multiply(grip);m.decompose(group.position,group.quaternion,group.scale);group.updateMatrixWorld(true);
        }else if(state.done){sample('HER-TRAY-PUT',actions['HER-TRAY-PUT'].getClip().duration,TRAY_SERVICE.table);delivered={id:state.id,recipients:state.recipients,poured:state.poured};}
        else showDock();
      },
    };
    return {...prior,group:container,service,post(id,t,F){prior.post(id,t,F);if(controller?.state)service.post(controller.state,F);},};
  };
  extra.trayService=true;
}

// Sequencing only: navigation, skeleton playback and props use the existing runtime.
export function createTrayController(api){
  let state=null;
  const reset=()=>{api.props.restore();state=null;};
  function enter(){const s=state,step=s.plan[s.index];s.step=step;s.t=0;s.started=false;
    if(step.kind==='walk')api.go(step.point);
    if(step.kind==='clip')api.pose(step.clip,0);
    if(step.kind==='done'){s.done=true;s.carrying=false;api.label(step.label);api.complete(s.valid);}
  }
  return {
    get state(){return state;},reset,
    frame(command,dt,replaying){
      const c=command?.service;
      if(command?.activity!=='heroine_serve'||!c){if(state)reset();return false;}
      if(!state||state.seq!==command.seq){reset();state={id:c.id,seq:command.seq,recipients:c.recipients,plan:trayPlan(c.recipients,api.durations),index:0,t:0,elapsedMs:0,motionMs:0,poured:0,carrying:false,done:false,valid:!replaying};api.props.begin(c);enter();}
      const s=state;if(c.cancelled)s.valid=false;if(replaying||dt>.25||dt<0)s.valid=false;
      if(s.done)return true;
      s.elapsedMs+=Math.max(0,dt)*1000;
      const step=s.step;api.label(step.label);
      if(step.kind==='walk'){
        if(api.arrived(step.point,dt)){s.index++;enter();}
        return true;
      }
      if(!s.started){s.started=true;s.t=0;}else {s.motionMs+=Math.max(0,Math.min(dt,step.duration-s.t))*1000;s.t+=dt;}
      api.pose(step.clip,Math.min(s.t,step.duration));
      if(step.clip==='HER-POUR'&&s.t>=8)s.poured=Math.max(s.poured,step.index+1);
      // Transition only on the next frame, after props and hands evaluated the final pose.
      if(s.t>=step.duration+.034){
        if(step.clip==='HER-TRAY-PICK'){api.props.capture();s.carrying=true;}
        if(step.clip==='HER-TRAY-PUT')s.carrying=false;
        s.index++;enter();
      }
      return true;
    },
    snapshot(){return state?{version:1,id:state.id,seq:state.seq,step:state.index,elapsedMs:state.elapsedMs,motionMs:state.motionMs,valid:state.valid,phase:state.step.kind==='done'?'delivered':state.step.clip||state.step.kind,poured:state.poured,complete:state.done&&state.valid,trayOnTable:state.done,recipients:state.recipients}:null;},
  };
}
