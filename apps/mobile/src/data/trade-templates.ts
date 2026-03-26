import type { Trade } from '../api/onboarding';

export interface OfflineTemplateItem {
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory: string;
}

export const OFFLINE_TRADE_TEMPLATES: Record<Trade, OfflineTemplateItem[]> = {
  plumbing: [
    { name: 'Faucet Repair', unit: 'each', unitPriceCents: 8500, tradeCategory: 'plumbing' },
    { name: 'Toilet Install', unit: 'each', unitPriceCents: 35000, tradeCategory: 'plumbing' },
    { name: 'Drain Cleaning', unit: 'each', unitPriceCents: 17500, tradeCategory: 'plumbing' },
    { name: 'Water Heater Install', unit: 'each', unitPriceCents: 125000, tradeCategory: 'plumbing' },
    { name: 'Pipe Repair', unit: 'per foot', unitPriceCents: 4500, tradeCategory: 'plumbing' },
    { name: 'Garbage Disposal Install', unit: 'each', unitPriceCents: 27500, tradeCategory: 'plumbing' },
    { name: 'Sump Pump Install', unit: 'each', unitPriceCents: 65000, tradeCategory: 'plumbing' },
    { name: 'Water Line Repair', unit: 'each', unitPriceCents: 45000, tradeCategory: 'plumbing' },
    { name: 'Fixture Replacement', unit: 'each', unitPriceCents: 15000, tradeCategory: 'plumbing' },
    { name: 'Emergency Service Call', unit: 'each', unitPriceCents: 15000, tradeCategory: 'plumbing' },
  ],
  electrical: [
    { name: 'Outlet Install', unit: 'each', unitPriceCents: 17500, tradeCategory: 'electrical' },
    { name: 'Light Fixture Install', unit: 'each', unitPriceCents: 12500, tradeCategory: 'electrical' },
    { name: 'Panel Upgrade', unit: 'each', unitPriceCents: 175000, tradeCategory: 'electrical' },
    { name: 'Ceiling Fan Install', unit: 'each', unitPriceCents: 22500, tradeCategory: 'electrical' },
    { name: 'Switch Replacement', unit: 'each', unitPriceCents: 8500, tradeCategory: 'electrical' },
    { name: 'Circuit Breaker Replace', unit: 'each', unitPriceCents: 25000, tradeCategory: 'electrical' },
    { name: 'Recessed Lighting', unit: 'per light', unitPriceCents: 15000, tradeCategory: 'electrical' },
    { name: 'Whole-House Surge Protector', unit: 'each', unitPriceCents: 45000, tradeCategory: 'electrical' },
    { name: 'Smoke Detector Install', unit: 'each', unitPriceCents: 7500, tradeCategory: 'electrical' },
    { name: 'Emergency Service Call', unit: 'each', unitPriceCents: 15000, tradeCategory: 'electrical' },
  ],
  hvac: [
    { name: 'AC Tune-Up', unit: 'each', unitPriceCents: 12500, tradeCategory: 'hvac' },
    { name: 'Furnace Repair', unit: 'each', unitPriceCents: 35000, tradeCategory: 'hvac' },
    { name: 'Thermostat Install', unit: 'each', unitPriceCents: 22500, tradeCategory: 'hvac' },
    { name: 'Duct Cleaning', unit: 'per vent', unitPriceCents: 4500, tradeCategory: 'hvac' },
    { name: 'AC Refrigerant Recharge', unit: 'each', unitPriceCents: 25000, tradeCategory: 'hvac' },
    { name: 'Filter Replacement', unit: 'each', unitPriceCents: 7500, tradeCategory: 'hvac' },
    { name: 'Blower Motor Repair', unit: 'each', unitPriceCents: 45000, tradeCategory: 'hvac' },
    { name: 'AC Install', unit: 'each', unitPriceCents: 450000, tradeCategory: 'hvac' },
    { name: 'Furnace Install', unit: 'each', unitPriceCents: 350000, tradeCategory: 'hvac' },
    { name: 'Emergency Service Call', unit: 'each', unitPriceCents: 15000, tradeCategory: 'hvac' },
  ],
};
