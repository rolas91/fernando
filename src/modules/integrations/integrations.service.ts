import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type GeocodeInput = {
  id: string;
  name: string;
  location: string;
  city: string;
  status: string;
  clientName: string;
};

type NotificationBody = {
  action?: 'send_sms' | 'send_email' | 'send_in_app';
  phone?: string;
  message?: string;
  workerName?: string;
  email?: string;
};

@Injectable()
export class IntegrationsService {
  async geocodeJobs(locations: GeocodeInput[]) {
    const provider = (
      process.env.GEOCODING_PROVIDER || 'placeholder'
    ).toLowerCase();
    const key = process.env.GEOCODING_API_KEY || '';

    if (!key || provider === 'placeholder') {
      return {
        success: true,
        simulated: true,
        locations: locations.map((l) => ({ ...l, lat: null, lng: null })),
      };
    }

    const geocoded = await Promise.all(
      locations.map(async (l) => {
        const query = encodeURIComponent(`${l.location}, ${l.city}`);
        const url =
          provider === 'mapbox'
            ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?limit=1&access_token=${key}`
            : `https://api.opencagedata.com/geocode/v1/json?q=${query}&key=${key}&limit=1`;

        try {
          const res = await fetch(url);
          if (!res.ok) return { ...l, lat: null, lng: null };
          const data = (await res.json()) as Record<string, unknown>;
          if (provider === 'mapbox') {
            const features = (data.features || []) as Array<{
              center?: [number, number];
            }>;
            const center = features[0]?.center;
            return { ...l, lat: center?.[1] ?? null, lng: center?.[0] ?? null };
          }
          const results = (data.results || []) as Array<{
            geometry?: { lat?: number; lng?: number };
          }>;
          return {
            ...l,
            lat: results[0]?.geometry?.lat ?? null,
            lng: results[0]?.geometry?.lng ?? null,
          };
        } catch {
          return { ...l, lat: null, lng: null };
        }
      }),
    );

    return { success: true, simulated: false, provider, locations: geocoded };
  }

  async sendNotification(body: NotificationBody) {
    const action = body.action || 'send_in_app';
    if (action === 'send_sms') return this.sendSms(body);
    if (action === 'send_email') return this.sendEmail(body);
    return {
      success: true,
      simulated: true,
      channel: 'in_app',
      note: 'In-app notification simulated',
    };
  }

  private async sendSms(body: NotificationBody) {
    const sid = process.env.TWILIO_ACCOUNT_SID || '';
    const token = process.env.TWILIO_AUTH_TOKEN || '';
    const from = process.env.TWILIO_FROM_NUMBER || '';
    if (!sid || !token || !from) {
      return {
        success: true,
        simulated: true,
        channel: 'sms',
        note: `SMS simulated for ${body.phone || 'unknown phone'}`,
      };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams();
    params.set('To', body.phone || '');
    params.set('From', from);
    params.set('Body', body.message || 'Notification');
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      return {
        success: false,
        simulated: false,
        channel: 'sms',
        note: `Twilio error ${res.status}`,
      };
    }
    return { success: true, simulated: false, channel: 'sms' };
  }

  private async sendEmail(body: NotificationBody) {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || 'no-reply@example.com';
    if (!host || !user || !pass) {
      return {
        success: true,
        simulated: true,
        channel: 'email',
        note: `Email simulated for ${body.workerName || body.email || 'worker'}`,
      };
    }

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    };
    const transporter = nodemailer.createTransport(transportOptions);

    await transporter.sendMail({
      from,
      to: body.email,
      subject: 'Notification',
      text: body.message || 'Notification',
    });

    return { success: true, simulated: false, channel: 'email' };
  }
}
