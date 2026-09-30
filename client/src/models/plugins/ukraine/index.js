// client/src/models/plugins/ukraine/index.js
//
// PyPSA Ukraine FBMC client plugin (plan §7, Phase 3). The registry nav for
// this model exposes overview / config / run / results only, so unlike gcam
// no DataView / StreamlitView placeholders are provided; the shared route
// pages degrade gracefully if hit directly.

import ConfigForm from "./ConfigForm";
import RunView from "./RunView";
import ResultsView from "./ResultsView";

const plugin = {
  ConfigForm,
  RunView,
  ResultsView,
};

export default plugin;
