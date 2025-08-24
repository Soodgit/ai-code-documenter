import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export function LogoutButton() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    console.log('लॉगआउट प्रक्रिया शुरू...');
    
    try {
      // पहले लोकल स्टोरेज से डेटा हटाएं
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      console.log('लोकल स्टोरेज से डेटा हटा दिया गया');
      
      // फिर API कॉल करें
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('लॉगआउट API रिस्पॉन्स:', response.status);
      
      // अब नेविगेट करें - रिस्पॉन्स का इंतज़ार किए बिना
      navigate('/');
    } catch (error) {
      console.error('लॉगआउट के दौरान त्रुटि:', error);
      // त्रुटि होने पर भी होम पेज पर भेजें
      navigate('/');
    }
  };

  return (
    <button 
      onClick={handleLogout}
      className="text-red-500 hover:text-red-600 font-medium"
    >
      लॉगआउट
    </button>
  );
}

// पूर्ण लॉगआउट पेज (यदि आवश्यक हो)
export default function LogoutPage() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // पेज लोड होते ही लॉगआउट प्रक्रिया शुरू करें
    async function performLogout() {
      console.log('ऑटोमैटिक लॉगआउट...');
      
      // लोकल स्टोरेज क्लियर करें
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      try {
        // API कॉल करें
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('लॉगआउट API कॉल में त्रुटि:', error);
      } finally {
        // सभी केस में होम पेज पर भेजें
        navigate('/', { replace: true });
      }
    }
    
    performLogout();
  }, [navigate]);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-2">लॉगआउट हो रहा है...</h1>
        <p className="text-gray-600">आपको होम पेज पर रीडायरेक्ट किया जा रहा है</p>
      </div>
    </div>
  );
}