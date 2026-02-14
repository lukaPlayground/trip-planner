import { useState, useContext, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';

const Login = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isRegister, setIsRegister] = useState(searchParams.get('tab') === 'register');

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold text-blue-600 cursor-pointer"
            onClick={() => navigate('/')}
          >
            Trip Planner
          </h1>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          {isRegister ? (
            <RegisterForm onSwitchToLogin={() => setIsRegister(false)} />
          ) : (
            <LoginForm onSwitchToRegister={() => setIsRegister(true)} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
