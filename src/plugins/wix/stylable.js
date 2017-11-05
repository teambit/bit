const pluginType = 'file-type';

function getExtension() {
  return 'st.css';
}

function getTemplate() {
  return ':import { -st-from: "{filePath}.st.css"; }';
}

export { getExtension, getTemplate, pluginType };
