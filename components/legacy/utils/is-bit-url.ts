export default function isBitUrl(url: string) {
  const regex = new RegExp('((bit|ssh|http(s)?)|(bit@[w.]+))(:(//)?)([w.@:/-~]+)(.bit)(/)?');
  return regex.test(url);
}
