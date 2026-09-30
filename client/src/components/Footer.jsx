import { useState } from "react";
import TermsModal from "./TermsModal";

export default function Footer() {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <>
      <footer className="bg-gray-100 border-t border-gray-200 text-center py-3 text-sm text-gray-500">
        &copy; {new Date().getFullYear()} EnSolve / NTNU &nbsp;&middot;&nbsp;
        <button
          onClick={() => setTermsOpen(true)}
          className="underline hover:text-blue-600 focus:outline-none"
        >
          Terms of Use
        </button>
      </footer>
      <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
    </>
  );
}
