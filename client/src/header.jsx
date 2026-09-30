import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const handleProtectedNav = (target) => {
    if (!token) {
      navigate('/login', { state: { from: target } });
      return;
    }
    navigate(target);
  };

  return (
    <header className="bg-white shadow-md py-4 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4 cursor-pointer" onClick={() => navigate('/')}>
        <img src="/iDesingRES.png" alt="Logo" className="w-12 h-auto" />
        <h1 className="text-3xl font-bold text-blue-700">EnSolve Cloud</h1>
      </div>
      <nav className="space-x-4 text-lg font-medium">
        <Link to="/" className="text-gray-700 hover:text-blue-600">About</Link>
        <button
          type="button"
          onClick={() => handleProtectedNav('/models')}
          className="text-gray-700 hover:text-blue-600"
        >
          Select model
        </button>
        <button
          type="button"
          onClick={() => handleProtectedNav('/profile')}
          className="text-gray-700 hover:text-blue-600"
        >
          Profile
        </button>
      </nav>
    </header>
  );
}
