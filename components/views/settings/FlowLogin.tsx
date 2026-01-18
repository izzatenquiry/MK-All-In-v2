import React, { useState, useCallback, useEffect, useRef } from 'react';
import { saveUserPersonalAuthToken, saveUserRecaptchaToken, hasActiveTokenUltraWithRegistration, getMasterRecaptchaToken, getTokenUltraRegistration, getEmailFromPoolByCode, getUserProfile } from '../../../services/userService';
import { type User, type TokenUltraRegistration } from '../../../types';
import { KeyIcon, CheckCircleIcon, XIcon, AlertTriangleIcon, InformationCircleIcon, EyeIcon, EyeOffIcon, SparklesIcon, ClipboardIcon, ServerIcon, UserIcon, ClockIcon, VideoIcon, PlayIcon } from '../../Icons';
import Spinner from '../../common/Spinner';
import { getTranslations } from '../../../services/translations';
import { generateImageWithNanoBanana } from '../../../services/imagenV3Service';
import { testAntiCaptchaKey } from '../../../services/antiCaptchaService';
import eventBus from '../../../services/eventBus';
import { getBotAdminApiUrlWithFallback } from '../../../services/appConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface FlowLoginProps {
    currentUser?: User | null;
    onUserUpdate?: (user: User) => void;
    onOpenChangeServerModal?: () => void;
}

const FlowLogin: React.FC<FlowLoginProps> = ({ currentUser, onUserUpdate, onOpenChangeServerModal }) => {
    const [flowToken, setFlowToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [tokenSaved, setTokenSaved] = useState(false);
    
    const saveTimeoutRef = useRef<any>(null);
    const recaptchaSaveTimeoutRef = useRef<any>(null);
    const isInitialMount = useRef(true);
    const masterTokenResolvedRef = useRef(false);
    const T = getTranslations().settingsView;
    const T_Api = T.api;

    // Shared API Key State
    const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
    const [isLoadingMasterToken, setIsLoadingMasterToken] = useState(false);

    // Anti-Captcha State
    const [antiCaptchaApiKey, setAntiCaptchaApiKey] = useState('');
    const [showAntiCaptchaKey, setShowAntiCaptchaKey] = useState(false);
    const [antiCaptchaTestStatus, setAntiCaptchaTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [antiCaptchaTestMessage, setAntiCaptchaTestMessage] = useState<string>('');
    const [recaptchaTokenSaved, setRecaptchaTokenSaved] = useState(false);
    const [isSavingRecaptcha, setIsSavingRecaptcha] = useState(false);
    
    // Token Ultra Status State
    const [ultraRegistration, setUltraRegistration] = useState<TokenUltraRegistration | null>(null);
    const [isLoadingUltra, setIsLoadingUltra] = useState(false);
    const [emailDetails, setEmailDetails] = useState<{ email: string; password: string } | null>(null);

    // Helper function to check if Token Ultra is active
    const isTokenUltraActive = useCallback((): boolean => {
        if (!ultraRegistration) return false;
        const expiresAt = new Date(ultraRegistration.expires_at);
        const now = new Date();
        return ultraRegistration.status === 'active' && expiresAt > now;
    }, [ultraRegistration]);
    
    // Helper function to calculate hours and minutes since last save
    const getTimeSinceLastSave = useCallback((lastSave: string): { hours: number; minutes: number } => {
        const lastSaveDate = new Date(lastSave);
        const now = new Date();
        const diffMs = now.getTime() - lastSaveDate.getTime();
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return { hours, minutes };
    }, []);
    
    // Server State
    const [currentServer, setCurrentServer] = useState<string | null>(null);
    
    // Video Tutorial Modal State
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Anti-Captcha Video Tutorial Modal State
    const [isAntiCaptchaVideoModalOpen, setIsAntiCaptchaVideoModalOpen] = useState(false);
    const antiCaptchaVideoRef = useRef<HTMLVideoElement>(null);
    
    // Generated Token from API State
    const [generatedToken, setGeneratedToken] = useState('');
    const [isLoadingToken, setIsLoadingToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [tokenCredits, setTokenCredits] = useState<number | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);

    const [testStatus, setTestStatus] = useState<'idle' | 'testing'>('idle');
    const [testResults, setTestResults] = useState<{ service: string; success: boolean; message: string }[] | null>(null);
    
    const fetchCurrentServer = useCallback(() => {
        const server = sessionStorage.getItem('selectedProxyServer');
        setCurrentServer(server);
    }, []);

    useEffect(() => {
        fetchCurrentServer();
        setActiveApiKey(sessionStorage.getItem(BRAND_CONFIG.sessionKey));
        
        const handleServerChanged = () => fetchCurrentServer();
        eventBus.on('serverChanged', handleServerChanged);
        
        return () => {
            eventBus.remove('serverChanged', handleServerChanged);
        };
    }, [fetchCurrentServer]);
    
    // Synchronize states with currentUser
    useEffect(() => {
        if (!currentUser) return;
        
        masterTokenResolvedRef.current = false;
        
        if (currentUser.personalAuthToken) {
            setFlowToken(currentUser.personalAuthToken);
        }
        
        const resolveAntiCaptchaKey = async () => {
            if (BRAND_CONFIG.name === 'ESAIE') {
                if (masterTokenResolvedRef.current) return;
                
                const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
                if (cachedMasterToken && cachedMasterToken.trim()) {
                    setAntiCaptchaApiKey(cachedMasterToken);
                    masterTokenResolvedRef.current = true;
                } else {
                    if (!isLoadingMasterToken) {
                        setIsLoadingMasterToken(true);
                        try {
                            const masterTokenResult = await getMasterRecaptchaToken(true);
                            if (masterTokenResult.success && masterTokenResult.apiKey) {
                                setAntiCaptchaApiKey(masterTokenResult.apiKey);
                                masterTokenResolvedRef.current = true;
                            }
                        } catch (error) {
                            console.error('[FlowLogin] Error resolving master token:', error);
                        } finally {
                            setIsLoadingMasterToken(false);
                        }
                    }
                }
                return;
            }

            let apiKey = currentUser.recaptchaToken || '';
            const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
            let tokenUltraReg: any = null;
            
            if (cachedReg) {
                try {
                    tokenUltraReg = JSON.parse(cachedReg);
                } catch (e) {}
            }

            if (!tokenUltraReg) {
                const ultraResult = await hasActiveTokenUltraWithRegistration(currentUser.id);
                if (ultraResult.isActive && ultraResult.registration) {
                    tokenUltraReg = ultraResult.registration;
                }
            }

            if (tokenUltraReg) {
                const expiresAt = new Date(tokenUltraReg.expires_at);
                const now = new Date();
                const isActive = tokenUltraReg.status === 'active' && expiresAt > now;

                if (isActive) {
                    const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;
                    if (!isBlockedFromMaster) {
                        const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
                        if (cachedMasterToken && cachedMasterToken.trim()) {
                            apiKey = cachedMasterToken;
                        } else {
                            const masterTokenResult = await getMasterRecaptchaToken();
                            apiKey = (masterTokenResult.success && masterTokenResult.apiKey) ? masterTokenResult.apiKey : (currentUser.recaptchaToken || '');
                        }
                    } else {
                        apiKey = currentUser.recaptchaToken || '';
                    }
                } else {
                    apiKey = currentUser.recaptchaToken || '';
                }
            } else {
                apiKey = currentUser.recaptchaToken || '';
            }

            setAntiCaptchaApiKey(apiKey);
        };
        
        resolveAntiCaptchaKey();
        
        const loadTokenUltraDetails = async () => {
            if (BRAND_CONFIG.name === 'ESAIE') return;
            setIsLoadingUltra(true);
            try {
                const regResult = await getTokenUltraRegistration(currentUser.id);
                if (regResult.success && regResult.registration) {
                    setUltraRegistration(regResult.registration);
                    if (regResult.registration.email_code) {
                        const emailResult = await getEmailFromPoolByCode(regResult.registration.email_code);
                        if (emailResult.success) {
                            setEmailDetails({ email: emailResult.email, password: emailResult.password });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load ultra status", e);
            } finally {
                setIsLoadingUltra(false);
            }
        };
        loadTokenUltraDetails();
        
        if (isInitialMount.current) isInitialMount.current = false;
    }, [currentUser?.id]);

    // Auto-save Flow Token
    useEffect(() => {
        if (isInitialMount.current || !currentUser || !flowToken.trim()) return;
        const currentToken = currentUser.personalAuthToken || '';
        if (currentToken && flowToken.trim() === currentToken.trim()) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const result = await saveUserPersonalAuthToken(currentUser.id, flowToken.trim());
                if (result.success) {
                    setTokenSaved(true);
                    if (onUserUpdate) onUserUpdate(result.user);
                    setTimeout(() => setTokenSaved(false), 3000);
                }
            } catch (err) {
                console.error("Auto-save Flow Token failed", err);
            } finally {
                setIsSaving(false);
            }
        }, 2000);

        return () => clearTimeout(saveTimeoutRef.current);
    }, [flowToken, currentUser, onUserUpdate]);

    // Auto-save Anti-Captcha Key
    useEffect(() => {
        if (isInitialMount.current || !currentUser || !antiCaptchaApiKey.trim()) return;
        if (BRAND_CONFIG.name === 'ESAIE') return;

        const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
        let tokenUltraReg: any = null;
        if (cachedReg) {
            try { tokenUltraReg = JSON.parse(cachedReg); } catch (e) {}
        }

        if (tokenUltraReg) {
            const expiresAt = new Date(tokenUltraReg.expires_at);
            const now = new Date();
            const isActive = tokenUltraReg.status === 'active' && expiresAt > now;
            const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;
            if (isActive && !isBlockedFromMaster) return;
        }

        if (antiCaptchaApiKey.trim() === (currentUser.recaptchaToken || '')) return;

        if (recaptchaSaveTimeoutRef.current) clearTimeout(recaptchaSaveTimeoutRef.current);

        recaptchaSaveTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSavingRecaptcha(true);
                const result = await saveUserRecaptchaToken(currentUser.id, antiCaptchaApiKey.trim());
                if (result.success) {
                    setRecaptchaTokenSaved(true);
                    if (onUserUpdate) onUserUpdate(result.user);
                    setTimeout(() => setRecaptchaTokenSaved(false), 3000);
                }
            } catch (err) {
                console.error("Auto-save Anti-Captcha failed", err);
            } finally {
                setIsSavingRecaptcha(false);
            }
        }, 2000);

        return () => clearTimeout(recaptchaSaveTimeoutRef.current);
    }, [antiCaptchaApiKey, currentUser, onUserUpdate]);

    useEffect(() => {
        if (isVideoModalOpen && videoRef.current) {
            videoRef.current.play().catch(() => {});
        }
    }, [isVideoModalOpen]);

    useEffect(() => {
        if (isAntiCaptchaVideoModalOpen && antiCaptchaVideoRef.current) {
            antiCaptchaVideoRef.current.play().catch(() => {});
        }
    }, [isAntiCaptchaVideoModalOpen]);

    const handleTestAntiCaptcha = async () => {
        if (!antiCaptchaApiKey.trim()) return;
        setAntiCaptchaTestStatus('testing');
        setAntiCaptchaTestMessage('Testing API key...');
        try {
            const result = await testAntiCaptchaKey(antiCaptchaApiKey.trim());
            if (result.valid) {
                setAntiCaptchaTestStatus('success');
                setAntiCaptchaTestMessage('✅ API key is valid!');
            } else {
                setAntiCaptchaTestStatus('error');
                setAntiCaptchaTestMessage(`❌ ${result.error || 'Invalid API key'}`);
            }
        } catch (error) {
            setAntiCaptchaTestStatus('error');
            setAntiCaptchaTestMessage('❌ Test failed');
        }
        setTimeout(() => { setAntiCaptchaTestStatus('idle'); setAntiCaptchaTestMessage(''); }, 5000);
    };

    const handleOpenFlow = () => window.open('https://labs.google/fx/tools/flow', '_blank');
    const handleGetToken = () => window.open('https://labs.google/fx/api/auth/session', '_blank');

    const handleTestToken = useCallback(async () => {
        const tokenToTest = flowToken.trim() || generatedToken?.trim() || currentUser?.personalAuthToken;
        if (!tokenToTest) return;
        setTestStatus('testing');
        setTestResults(null);
        try {
            let nanoBananaSuccess = false;
            let errorMessage = '';
            
            try {
                await generateImageWithNanoBanana({
                    prompt: 'test',
                    config: { authToken: tokenToTest, sampleCount: 1, aspectRatio: '1:1' }
                }, undefined, true);
                nanoBananaSuccess = true;
            } catch (error: any) {
                errorMessage = error instanceof Error ? error.message : String(error);
                setTestResults([
                    { service: 'NanoBanana', success: false, message: errorMessage },
                    { service: 'Veo', success: false, message: errorMessage },
                ]);
                setTestStatus('idle');
                return;
            }
            
            if (nanoBananaSuccess) {
                setTestResults([
                    { service: 'NanoBanana', success: true, message: 'Operational' },
                    { service: 'Veo', success: true, message: 'Operational' },
                ]);
            }
        } catch (err: any) {
            const msg = err instanceof Error ? err.message : 'Test failed';
            setTestResults([
                { service: 'NanoBanana', success: false, message: msg },
                { service: 'Veo', success: false, message: msg },
            ]);
        } finally {
            setTestStatus('idle');
        }
    }, [flowToken, generatedToken, currentUser?.personalAuthToken]);

    const handleGetNewToken = async () => {
        if (!currentUser) return;
        setIsLoadingToken(true);
        setTokenError(null);
        setGeneratedToken('');
        setTokenCredits(null);
        setCountdown(120);
        
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = window.setInterval(() => {
            setCountdown(prev => (prev === null) ? null : prev - 1);
        }, 1000) as unknown as number;
        
        try {
            const apiUrl = await getBotAdminApiUrlWithFallback();
            const requestBody: any = {};
            if (currentUser.email) requestBody.email = currentUser.email;
            else if (currentUser.id) requestBody.telegram_id = currentUser.id;
            else if (currentUser.username) requestBody.username = currentUser.username;

            const response = await fetch(`${apiUrl}/api/generate-token-for-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            
            const data = await response.json();
            if (data.success) {
                setGeneratedToken(data.token);
                setTokenCredits(data.credits);
                setFlowToken(data.token);
                
                try {
                    setIsSaving(true);
                    const saveResult = await saveUserPersonalAuthToken(currentUser.id, data.token.trim());
                    if (saveResult.success) {
                        setTokenSaved(true);
                        if (onUserUpdate) onUserUpdate(saveResult.user);
                        setSuccessMessage('Token generated and saved successfully!');
                    }
                } catch (saveError) {} finally { setIsSaving(false); }
                
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                setCountdown(0);
            } else {
                setTokenError(data.error || 'Failed to generate token');
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                setCountdown(null);
            }
        } catch (err: any) {
            setTokenError(err instanceof Error ? err.message : 'Failed to connect to API');
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setCountdown(null);
        } finally {
            setIsLoadingToken(false);
            setTimeout(() => setSuccessMessage(null), 5000);
        }
    };

    if (!currentUser) return null;

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left Panel: Flow Login */}
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6 border border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <KeyIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Flow Login</h2>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your manual authentication tokens</p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-blue-800 dark:text-blue-200">
                                <p className="font-bold mb-2 uppercase tracking-wide">How to get your Flow Token:</p>
                                <ol className="space-y-1.5 list-decimal list-inside font-medium">
                                    <li>Click the "Generate NEW Token" button below</li>
                                    <li>Your token will be automatically generated and saved</li>
                                    <li>You can use it immediately for your session</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    {!isLoadingUltra && ultraRegistration && (
                        <div className="mb-6 space-y-4 animate-zoomIn">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-primary-500" />
                                Token Ultra Status
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 uppercase">Status:</span>
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                                        ultraRegistration.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {ultraRegistration.status === 'active' ? 'ACTIVE' : 'Expired'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Personal Token (Flow Token)</label>
                            <div className="relative">
                                <input type={showToken ? 'text' : 'password'} value={flowToken} onChange={(e) => setFlowToken(e.target.value)} placeholder="Paste your Flow token here" className="w-full px-4 py-3 pr-20 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm" />
                                <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
                                    {tokenSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
                                    {isSaving && <Spinner />}
                                    <button type="button" onClick={() => setShowToken(!showToken)} className="px-3 flex items-center text-neutral-500">
                                        {showToken ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={handleGetNewToken} disabled={isLoadingToken} className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                                {isLoadingToken ? `Generating... (${countdown}s)` : 'Generate NEW Token'}
                            </button>
                            <button onClick={handleTestToken} disabled={testStatus === 'testing'} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {testStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />} Health Test
                            </button>
                        </div>

                        {testResults && (
                            <div className="space-y-2 mt-4">
                                {testResults.map(res => (
                                    <div key={res.service} className={`p-2 rounded-md text-sm ${res.success ? 'bg-green-50' : 'bg-red-50'}`}>
                                        <p className="font-semibold">{res.service}: {res.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel */}
                <div className="flex flex-col gap-6">
                    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-primary-500" />
                            API Status
                        </h3>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                            <p className="text-sm">Connection: {activeApiKey ? 'Connected' : 'Not Connected'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {isVideoModalOpen && (
                <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center" onClick={() => setIsVideoModalOpen(false)}>
                    <button className="absolute top-6 right-6 text-white"><XIcon className="w-8 h-8"/></button>
                    <video ref={videoRef} src="https://monoklix.com/wp-content/uploads/2026/01/Video-01-Personal-Auth-Token.mp4" controls className="max-w-full max-h-full" />
                </div>
            )}
        </div>
    );
};

export default FlowLogin;
