import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const successHandled = useRef(false);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Token de verificação inválido');
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/auth/verify-email/${token}`);
        successHandled.current = true;
        setStatus('success');
        setMessage(response.data.message);
      } catch (error: any) {
        const msg = error.response?.data?.message || 'Erro ao verificar email';
        if (successHandled.current) return;
        if (msg.includes('já foi verificado') || msg.includes('já verificad')) {
          setStatus('success');
          setMessage('Este email já estava verificado. Você já pode fazer login.');
          return;
        }
        setStatus('error');
        setMessage(msg);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: 'url(/images/backgroundLogin.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-60"></div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        {status === 'loading' && (
          <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-blue-500 text-center">
            <div className="flex justify-center mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
            </div>
            <h1 className="text-2xl font-bold mb-4">Verificando seu email...</h1>
            <p className="text-gray-400">Aguarde um momento</p>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-green-500 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
              className="text-6xl mb-6"
            >
              ✅
            </motion.div>
            <h1 className="text-3xl font-bold mb-4 text-green-400">
              Email Verificado!
            </h1>
            <p className="text-gray-300 mb-8">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Fazer Login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-red-500 text-center">
            <div className="text-6xl mb-6">❌</div>
            <h1 className="text-3xl font-bold mb-4 text-red-400">
              Erro na Verificação
            </h1>
            <p className="text-gray-300 mb-8">{message}</p>
            <div className="flex flex-col gap-4">
              <Link
                to="/register"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Cadastrar Novamente
              </Link>
              <Link
                to="/login"
                className="inline-block bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Ir para Login
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
