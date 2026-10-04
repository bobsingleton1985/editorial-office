import {createChronicle} from './chronicle-view.js';
const q=new URLSearchParams(location.search);
let ownerToken=null;try{ownerToken=localStorage.getItem('editorial.owner');}catch{}
if(!window.__SERVER_SIMULATION&&!window.__DEMO&&!q.get('demo'))createChronicle({ownerToken,relay:q.get('relay')??'https://135-106-229-50.sslip.io'});
