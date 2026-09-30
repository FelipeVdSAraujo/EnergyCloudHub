import ConfigForm from "./ConfigForm";
import RunView from "./RunView";
import ResultsView from "./ResultsView";

const Placeholder = () => (
  <div className="text-sm text-gray-600">
    This page is not implemented yet for GCAM in this phase.
  </div>
);

const plugin = {
  DataView: Placeholder,
  ConfigForm,
  ResultsView,
  RunView,
  StreamlitView: Placeholder,
};

export default plugin;
