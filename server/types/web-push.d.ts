declare module 'web-push' {
  const webpush: {
    sendNotification(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: {
      vapidDetails: { publicKey: string; privateKey: string; subject: string }; TTL: number; urgency: string; topic: string; timeout: number;
    }): Promise<{ statusCode: number }>;
  };
  export default webpush;
}
