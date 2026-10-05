import {enqueueOwnerCall} from './director/owner-calls.mjs';
const args=process.argv.slice(2);
let target,commandId=null,command=null,instructionEligible=true;
while(['--to','--id','--command','--untrusted'].includes(args[0])){
  const flag=args.shift();if(flag==='--untrusted'){instructionEligible=false;continue;}const value=args.shift();
  if(!value){console.error(flag==='--to'?'unsupported_call_recipient':'invalid_call_id');process.exit(1);}
  if(flag==='--to')target=value;else if(flag==='--id')commandId=value;else {try{command=JSON.parse(value);}catch{console.error('invalid_dialogue_command');process.exit(1);}}
}
if(args[0]==='--')args.shift();
try {
  const value={text:args.join(' '),...(target!==undefined?{target}:{}),...(command?{command}:{}),...(instructionEligible===false?{instructionEligible:false}:{})};
  console.log(JSON.stringify(enqueueOwnerCall(new URL('./calls/',import.meta.url).pathname,value,commandId)));
} catch(error) {console.error(error.message);process.exitCode=1;}
