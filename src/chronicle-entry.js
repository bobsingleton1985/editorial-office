import {createChronicle} from './chronicle-view.js';
const q=new URLSearchParams(location.search);
let ownerToken=null;try{ownerToken=localStorage.getItem('editorial.owner');}catch{}
const DEFAULT_RELAY='https://135-106-229-50.sslip.io',relay=q.get('relay')??DEFAULT_RELAY;
// The owner key goes only to our relay or this page's own origin, never to a relay named in a shared link.
if(relay.replace(/\/$/,'')!==DEFAULT_RELAY&&relay!=='/')ownerToken=null;
if(!window.__SERVER_SIMULATION&&!window.__DEMO&&!q.get('demo'))createChronicle({ownerToken,relay});
