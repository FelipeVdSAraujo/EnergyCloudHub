import React from 'react';

/**
 * frnt_streamlit.js
 * 
 * Streamlit component for embedding the Streamlit visualization app within the EnSolve platform.
 * 
 * Features:
 * - Renders an iframe that loads the Streamlit app served at /streamlit/.
 * - Occupies the full viewport height and width for seamless integration.
 * - Uses Tailwind CSS utility classes for layout.
 * 
 * Exports:
 * - Streamlit: React functional component for displaying the embedded Streamlit app.
 */

const streamlitUrl = process.env.REACT_APP_STREAMLIT_URL || "/streamlit/";

const Streamlit = () => (
  <div className="w-full p-0 m-0" style={{ height: "100vh" }}>
    <iframe
      src={streamlitUrl}
      style={{ width: "100%", height: "100%", border: "none" }}
      title="Streamlit App"
    />
  </div>
);

export default Streamlit;