import { ArtifactFile } from '@teambit/component.ui.artifacts.models.component-artifacts-model';

export const fileNodeClicked =
  (files: (ArtifactFile & { id: string })[], opts: 'download' | 'new tab') => (e, node) => {
    const { id } = node;
    const artifactFile = files.find((file) => file.id === id);

    if (artifactFile?.downloadUrl) {
      fetch(artifactFile.downloadUrl, { method: 'GET' })
        .then((res) => res.blob())
        .then((blob) => {
          // create blob link to download
          const url = window.URL.createObjectURL(new Blob([blob]));
          const link = document.createElement('a');
          link.href = url;
          if (opts === 'download') link.setAttribute('download', artifactFile.path);
          if (opts === 'new tab') link.setAttribute('target', '_blank');
          // append to html page
          document.body.appendChild(link);
          // force download
          link.click();
          // clean up and remove the link
          link.parentNode?.removeChild(link);
        })
        .catch(() => {});
    }
  };
