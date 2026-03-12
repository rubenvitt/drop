export function resolveUploadPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && pathParts[1] ? `/u/${pathParts[1]}/upload` : '/upload';
}

export function isShareLinkPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && Boolean(pathParts[1]);
}
