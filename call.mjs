import {enqueueOwnerCall} from './director/owner-calls.mjs';
const args=process.argv.slice(2);
let target,commandId=null;
while(['--to','--id'].includes(args[0])){
  const flag=args.shift(),value=args.shift();
  if(!value){console.error(flag==='--to'?'unsupported_call_recipient':'invalid_call_id');process.exit(1);}
  if(flag==='--to')target=value;else commandId=value;
}
try {
  const command={text:args.join(' '),...(target!==undefined?{target}:{})};
  console.log(JSON.stringify(enqueueOwnerCall(new URL('./calls/',import.meta.url).pathname,command,commandId)));
} catch(error) {console.error(error.message);process.exitCode=1;}
