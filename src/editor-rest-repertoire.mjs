// Additional variants from banks already loaded on the accepted editor rig.
// They run only inside an independently chosen rest/wait, never as dialogue,
// an invented memory or a fabricated relationship/emotional event.
export const EDITOR_REST_VARIANTS=Object.freeze([
 Object.freeze(['feet_start','feet_idle','feet_relax_start','feet_relax_03','feet_relax_01','feet_relax_stop','feet_brush','feet_stop']),
]);
export const EDITOR_QUIET_VARIANTS=Object.freeze([
 {id:'emotions-quiet/IDLE-210',context:'calm',title:'посмотреть на часы'},
 {id:'emotions-quiet/IDLE-211',context:'calm',title:'оглядеться во время ожидания'},
 {id:'emotions-quiet/IDLE-040',context:'calm',title:'смахнуть с одежды'},
 {id:'emotions-quiet/IDLE-153',context:'calm',title:'разглядывать ногти'},
 {id:'emotions-quiet/IDLE-017',context:'calm',title:'размять плечи'},
 {id:'emotions-quiet/IDLE-201',context:'tired',title:'стоять с опущенными плечами'},
].map(Object.freeze));
const alias=id=>'social_'+id.replace(/[^a-zA-Z0-9]/g,'_');
export function editorRestPools(base){
 const extend=context=>[...base.stand[context],...EDITOR_QUIET_VARIANTS.filter(x=>x.context===context).map(x=>[alias(x.id)])];
 return {...base,desk:{...base.desk,calm:[...base.desk.calm,...EDITOR_REST_VARIANTS.map(x=>[...x])]},
  stand:{...base.stand,calm:extend('calm'),tired:extend('tired')}};
}
