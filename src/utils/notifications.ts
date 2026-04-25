export const sendNotification = async (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    // Chrome on Android requires notifications to be sent via the Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return;
      } catch (e) {
        console.error("Service worker notification failed", e);
      }
    }
    
    // Fallback for desktop browsers
    new Notification(title, options);
  }
};
