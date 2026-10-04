#!/usr/bin/env node
// Local owner bridge. Never called by Jev or the browser.
import {fileURLToPath} from 'node:url';
import {parseBonus,enqueueBonus,bonusStatus} from './director/owner-bonuses.mjs';
const dir=fileURLToPath(new URL('./owner-commands/',import.meta.url));
try{
 const args=process.argv.slice(2);
 if(args[0]==='--status'&&args.length===2)console.log(JSON.stringify(bonusStatus(dir,args[1])));
 else if(args.length===4&&args[2]==='--id')console.log(JSON.stringify(enqueueBonus(dir,parseBonus(args[0],args[1],args[3]))));
 else throw Error('Usage: ring.sh --bonus all|columnist|reporter|newspaper_editor|heroine USD --id UNIQUE_ID; ring.sh --bonus-status UNIQUE_ID');
}catch(error){console.error(error.message);process.exitCode=1;}
