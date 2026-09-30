import DataView from "./DataView";
import ConfigForm from "./ConfigForm";
import RunView from "./RunView";
import ResultsView from "./ResultsView";

const Placeholder = () => (
  <div className="text-sm text-gray-600">
    This page is not implemented yet for TransComp in this phase.
  </div>
);

const plugin = {
  DataView,
  ConfigForm,
  ResultsView,
  RunView,
  StreamlitView: Placeholder,
};

export default plugin;
