import DataView from './DataView';
import ConfigForm from './ConfigForm';
import ResultsView from './ResultsView';
import RunView from './RunView';
import StreamlitView from './StreamlitView';  

export { default as DataView } from './DataView';
export { default as ConfigForm } from './ConfigForm';
export { default as ResultsView } from './ResultsView';
export { default as RunView } from './RunView';
export { default as StreamlitView } from './StreamlitView';

const plugin = {
  DataView,
  ConfigForm,
  ResultsView,
  RunView,
  StreamlitView,
};

export default plugin;
