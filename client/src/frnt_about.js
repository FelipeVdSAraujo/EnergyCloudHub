import React from 'react';
/**
 * frnt_about.js
 * 
 * About page component for the EnSolve platform.
 * 
 * - Explains what EnSolve is and its purpose as an open-source cloud platform for energy optimization models.
 * - Describes how users can modify model parameters, run simulations on HPC clusters, and access results.
 * - Highlights the accessibility and empowerment EnSolve provides to researchers, students, and planners.
 * - Uses Tailwind CSS classes for layout and styling.
 * 
 * Exports:
 * - Downloads: React functional component rendering the About/Info page.
 */

const About = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-blue-800 mb-6">What is EnSolve?</h2>

      <p className="text-gray-700 leading-relaxed text-lg">
        <span className="font-semibold text-blue-700">EnSolve</span> is an open-source cloud platform where
        energy optimization models are hosted. These models often require significant computing power and
        domain expertise — something this platform helps users overcome.
      </p>

      <p className="text-gray-700 leading-relaxed text-lg mt-4">
        By simplifying how input data and configurations are managed, <span className="font-medium text-blue-700">anyone</span> can modify model parameters without needing advanced software skills. Once the model setup is complete, it can be executed on a high-performance computing cluster (HPC), enabling simulations that require hundreds of gigabytes of memory — far beyond what a typical personal computer can handle.
      </p>

      <p className="text-gray-700 leading-relaxed text-lg mt-4">
        As a user, you can select a model that fits your needs, adjust inputs and configuration, and submit the job with one click. After execution, the results will be available for download and review.
      </p>

      <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <p className="text-blue-800 font-medium">
          ➤ EnSolve empowers energy researchers, students, and planners to simulate complex energy systems with ease.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-blue-800 mb-3">Credits</h3>
        <p className="text-gray-700 leading-relaxed">
          The EnSolve platform is developed by{' '}
          <span className="font-medium">Felipe van de Sande Araujo</span> and{' '}
          <span className="font-medium">Martti Harma</span> at the Norwegian University of Science and
          Technology (NTNU), within the EU Horizon Europe project{' '}
          <a href="https://idesignres.eu/" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            iDesignRES
          </a>{' '}
          (grant agreement No. 101095849).
        </p>
      </div>
    </div>
  );
};

export default About;
