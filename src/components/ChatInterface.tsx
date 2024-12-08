import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ChatInterface.css';
import sendImage from '../assets/sendimg.png';
import ProgressCircle from './ProgressCircle';
import config from '../config/enviroments';
interface Message {
  id: number;
  text: string;
  isUser: boolean;
  displayText: string;
}

interface UploadedFile {
  id: string;
  file: File;
  name: string;
}

interface FileIdMapping {
  localId: string;
  serverId: string;
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [_, setFileIdMappings] = useState<FileIdMapping[]>([]);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [responseTime, setResponseTime] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const currentTimeRef = useRef<number>(0);

  const animationInterval = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const stopTyping = () => {
    if (animationInterval.current) {
      clearInterval(animationInterval.current);
    }
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsLoading(false);
    setResponseTime(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      name: file.name
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(uploadFile);
  };

  const handleDeleteFile = (fileId: string) => {
    setUploadedFiles(prev => {
      const newFiles = prev.filter(file => file.id !== fileId);
      return newFiles;
    });
  };

  const uploadFile = (uploadedFile: UploadedFile) => {
    setUploadProgress(prev => ({ ...prev, [uploadedFile.id]: 0 }));
    
    const formData = new FormData();
    formData.append("file", uploadedFile.file);

    axios.post(`${config.baseApiUrl}document/upload`, formData, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data'
      },
    })
    .then(response => {
      const serverId = response.data.file_id;
      setFileIdMappings(prev => [...prev, { localId: uploadedFile.id, serverId }]);
      monitorProgress(serverId, uploadedFile.id);
    })
    .catch(() => {
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[uploadedFile.id];
        return newProgress;
      });
      toast.error(`Ошибка загрузки файла ${uploadedFile.name}`);
    });
  };

  const monitorProgress = (serverId: string, localId: string) => {
    const es = new EventSource(`${config.baseApiUrl}document/upload/progress?file_id=${serverId}`);
  
    es.onmessage = (event) => {
      const eventData = JSON.parse(event.data);
      setUploadProgress(prev => ({
        ...prev,
        [localId]: eventData.progress
      }));
  
      if (eventData.event === "file.processing.completed") {
        es.close();
      }
    };
    
    es.onerror = () => {
      es.close();
      toast.error('Ошибка при отслеживании прогресса загрузки файла');
    };
  };
  

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
  
    currentTimeRef.current = 0;
    setResponseTime(0);
  
    abortControllerRef.current = new AbortController();
  
    const userMessage: Message = {
      id: Date.now(),
      text: inputText,
      isUser: true,
      displayText: inputText,
    };
  
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    
    axios.post(`${config.baseApiUrl}document/search?query=${encodeURIComponent(inputText)}`, {})
      .then(response => {
        const messageId = response.data.message_id;
  
        const loadingMessage: Message = {
          id: Date.now() + 1,
          text: `Получаем ответ... (0с)`,
          isUser: false,
          displayText: `Получаем ответ... (0с)`,
        };
        setMessages(prev => [...prev, loadingMessage]);
  
        timerRef.current = setInterval(() => {
          currentTimeRef.current += 1;
          setResponseTime(currentTimeRef.current);
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === loadingMessage.id 
                ? { 
                    ...msg, 
                    text: `Получаем ответ... (${currentTimeRef.current}с)`,
                    displayText: `Получаем ответ... (${currentTimeRef.current}с)`
                  }
                : msg
            )
          );
        }, 1000);
  
        const es = new EventSource(`${config.baseApiUrl}document/search?message_id=${messageId}`);
        setEventSource(es);
        let isFirstResponse = true;
  
        es.onmessage = (event) => {
          console.log(event.data);
          const data = JSON.parse(event.data);
          const answer = data.answer;
  
          if (answer.response) {
            const formattedResponse = answer.response
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\/g, '');

            if (isFirstResponse) {
              const modelMessage: Message = {
                id: loadingMessage.id,
                text: formattedResponse,
                isUser: false,
                displayText: `${formattedResponse} (${responseTime}с)`,
              };
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === loadingMessage.id ? modelMessage : msg
                )
              );
              isFirstResponse = false;
            } else {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === loadingMessage.id 
                    ? { 
                        ...msg, 
                        text: msg.text + formattedResponse,
                        displayText: `${msg.text + formattedResponse} (${responseTime}с)`
                      }
                    : msg
                )
              );
            }
          }
  
          if (answer.done) {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === loadingMessage.id 
                  ? { 
                      ...msg, 
                      text: msg.text,
                      displayText: `${msg.text} (${currentTimeRef.current}с)`
                    }
                  : msg
              )
            );
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setIsLoading(false);
            es.close();
          }
        };
        
        es.onerror = (error) => {
          es.close();
          console.log(error);
          setIsLoading(false);
          setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));
        };
  
        if (abortControllerRef.current) {
          abortControllerRef.current.signal.addEventListener('abort', () => {
            es.close();
            setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));
          });
        }
      })
      .catch(error => {
        if (!axios.isCancel(error)) {
          toast.error('Ошибка при отправке запроса');
        }
        setIsLoading(false);
      });
  };


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      name: file.name
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(uploadFile);
  };

  return (
    <div className="chat-container">
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar={true} />
      <div 
        className="files-sidebar"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <h3 className="files-title">Перетащите файлы сюда или нажмите для загрузки</h3>
        <div className="files-grid">
          {uploadedFiles.map(file => (
            <div key={file.id} className="file-item">
              <button 
                className="delete-file-btn"
                onClick={() => handleDeleteFile(file.id)}
                aria-label="Удалить файл"
              >
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path 
                    d="M18 6L6 18M6 6L18 18" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="file-icon"
              >
                <path 
                  d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M14 2v6h6M16 13H8M16 17H8M10 9H8" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
              
              <span className="file-name">{file.name}</span>
              <div className="upload-progress">
                <ProgressCircle percentage={uploadProgress[file.id] || null} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="messages-container">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={`message ${message.isUser ? 'user-message' : 'model-message'}`}
            >
              {message.isUser ? message.text : message.displayText}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <div className="attach-container">
          {isLoading ? (
            <div className="input-loading-spinner" />
          ) : (
            <label className="attach-label">
              <input
                type="file"
                onChange={handleFileChange}
                multiple
                className="file-input"
              />
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="attach-icon"
              >
                <path 
                  d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </label>
          )}
        </div>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Введите запрос для документов..."
          className="input-field"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          onClick={isLoading ? stopTyping : handleSubmit}
          className="submit-button"
        >
          {isLoading ? (
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className="close-icon"
            >
              <path 
                d="M18 6L6 18M6 6L18 18" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <img 
              src={sendImage} 
              alt="Send" 
              className="send-icon"
            />
          )}
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;
