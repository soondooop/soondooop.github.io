async function inflateB64(b64){
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}
