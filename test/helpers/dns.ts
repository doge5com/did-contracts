const packet = require('dns-packet')

export const hexEncodeName = (name: string) => {
  return '0x' + packet.name.encode(name).toString('hex')
}

export const hexEncodeTXT = (keys: string) => {
  return '0x' + packet.answer.encode(keys).toString('hex')
}

export const EMPTY_NODE = '0x0000000000000000000000000000000000000000000000000000000000000000'
