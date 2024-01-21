export class LinkPlugin {
  link(id) {
    return `${id.fullName}?scope=${id.scope}`;
  }
}
