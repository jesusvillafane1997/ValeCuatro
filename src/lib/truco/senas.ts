import { SenaInfo, SenaType } from './types';

export const SENAS_LIST: SenaInfo[] = [
  {
    type: 'ancho_espadas',
    title: 'Ancho de Espadas',
    gesture: 'Levantar las cejas',
    emoji: '🤨',
  },
  {
    type: 'ancho_bastos',
    title: 'Ancho de Bastos',
    gesture: 'Guiñar un ojo',
    emoji: '😉',
  },
  {
    type: 'siete_espadas',
    title: '7 de Espadas',
    gesture: 'Mueca a la derecha',
    emoji: '😏',
  },
  {
    type: 'siete_oro',
    title: '7 de Oro',
    gesture: 'Mueca a la izquierda',
    emoji: '😬',
  },
  {
    type: 'tres',
    title: 'Tres (3)',
    gesture: 'Morderse el labio',
    emoji: '🫦',
  },
  {
    type: 'dos',
    title: 'Dos (2)',
    gesture: 'Fruncir los labios (besito)',
    emoji: '😗',
  },
  {
    type: 'envido_alto',
    title: 'Envido Alto (30+)',
    gesture: 'Inflar los cachetes',
    emoji: '🐡',
  },
  {
    type: 'malas',
    title: 'Estoy Seco / Malas',
    gesture: 'Cerrar los ojos',
    emoji: '😑',
  },
];

export const SENAS_MAP: Record<SenaType, SenaInfo> = Object.fromEntries(
  SENAS_LIST.map((s) => [s.type, s])
) as Record<SenaType, SenaInfo>;
