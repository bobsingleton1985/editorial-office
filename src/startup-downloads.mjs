// Document-scoped prefetches: consume each body once, without retaining all GLBs.
export function createStartupDownloads(fetchBytes) {
  const inFlight=new Map(), preloaded=new Map();
  function request(url) {
    if(inFlight.has(url))return inFlight.get(url);
    const pending=Promise.resolve().then(()=>fetchBytes(url));
    inFlight.set(url,pending);
    pending.finally(()=>{if(inFlight.get(url)===pending)inFlight.delete(url);}).catch(()=>{});
    return pending;
  }
  function get(url) {
    if(preloaded.has(url)){const pending=preloaded.get(url);preloaded.delete(url);return pending;}
    return request(url);
  }
  function prefetch(url) {
    if(preloaded.has(url))return preloaded.get(url);
    const pending=request(url);preloaded.set(url,pending);
    pending.catch(()=>{if(preloaded.get(url)===pending)preloaded.delete(url);});
    return pending;
  }
  function retain(urls) {
    for(const url of preloaded.keys())if(!urls.has(url))preloaded.delete(url);
  }
  return {get,prefetch,retain};
}
