"""
Dashboard Server — Participante Standalone (modo single-connector)

Serve a interface web do participante e faz proxy para a API de gerenciamento
do connector EDC local. Lê configuração do .env no diretório pai.

Uso:
    python3 server.py
    (deve ser executado a partir do diretório dashboard/)
"""

import http.server
import urllib.request
import json
import os
import sys
import ssl
import pathlib


def load_env():
    """Carrega variáveis do .env do diretório pai (participante/)."""
    env_path = pathlib.Path(__file__).parent.parent / '.env'
    env = {}
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, _, value = line.partition('=')
                    env[key.strip()] = value.strip()
    return env


# Carregar configuração
ENV = load_env()
PORT_BASE = ENV.get('PORT_BASE', '13')
PARTICIPANT_ID = ENV.get('PARTICIPANT_ID', 'connector-c')
DASHBOARD_PORT = int(ENV.get('DASHBOARD_PORT', '3003'))
BROKER_URL = ENV.get('BROKER_URL', 'http://localhost:39192')

# Endpoints do connector local
CONNECTOR_MGMT = f"http://localhost:{PORT_BASE}192"
CONNECTOR_HEALTH = f"http://localhost:{PORT_BASE}191"

# Broker
BROKER_MGMT = BROKER_URL
BROKER_HEALTH = BROKER_URL.replace('39192', '39191') if '39192' in BROKER_URL else BROKER_URL


class ParticipantHandler(http.server.SimpleHTTPRequestHandler):
    """Handler HTTP para o dashboard do participante standalone."""

    def __init__(self, *args, **kwargs):
        # Servir arquivos estáticos a partir do diretório connector/
        directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'connector')
        super().__init__(*args, directory=directory, **kwargs)

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request('POST')
        elif self.path == '/rdf/import':
            self.handle_rdf_import()
        elif self.path.startswith('/config/'):
            self.handle_config_write()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_request('GET')
        elif self.path.startswith('/config/'):
            self.handle_config_read()
        elif self.path == '/config':
            self.handle_config_list()
        elif self.path.startswith('/shared/'):
            self.serve_shared_file()
        else:
            super().do_GET()

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_request('DELETE')
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def proxy_request(self, method):
        """Proxy requests to local connector or broker APIs."""
        path = self.path[5:]  # remove /api/

        routes = {
            'mgmt/': CONNECTOR_MGMT + '/',
            'health/': CONNECTOR_HEALTH + '/',
            'broker/': BROKER_MGMT + '/',
            'broker-health/': BROKER_HEALTH + '/',
        }

        target_url = None
        for prefix, base_url in routes.items():
            if path.startswith(prefix):
                target_url = base_url + path[len(prefix):]
                break

        if not target_url:
            self.send_error(404, 'Route not found: ' + path)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        try:
            headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
            req = urllib.request.Request(target_url, data=body, method=method, headers=headers)
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                response_body = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(response_body)
        except urllib.error.HTTPError as e:
            response_body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response_body)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def serve_shared_file(self):
        """Serve files from the shared/ directory."""
        path = self.path[8:]  # remove /shared/
        if '..' in path:
            self.send_error(403)
            return
        shared_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shared')
        filepath = os.path.join(shared_dir, path)
        if not os.path.exists(filepath):
            self.send_error(404)
            return
        content_type = self._guess_content_type(filepath)
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except Exception:
            self.send_error(500)

    def handle_config_read(self):
        """Read config files (schema and VCRs) from dashboard/config/."""
        path = self.path[8:]  # remove /config/
        if '..' in path or '/' in path or not path.endswith('.json'):
            self.send_json(400, {"error": "Invalid path"})
            return
        config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')
        filepath = os.path.join(config_dir, path)
        if not os.path.exists(filepath):
            self.send_json(404, {"error": f"File not found: {path}"})
            return
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.loads(f.read())
            self.send_json(200, data)
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_config_write(self):
        """Write config files (schema and VCRs) to dashboard/config/."""
        path = self.path[8:]  # remove /config/
        if '..' in path or '/' in path or not path.endswith('.json'):
            self.send_json(400, {"error": "Invalid path"})
            return
        config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')
        os.makedirs(config_dir, exist_ok=True)
        filepath = os.path.join(config_dir, path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            data = json.loads(body)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(json.dumps(data, ensure_ascii=False, indent=2))
            self.send_json(200, {"success": True, "file": path})
        except json.JSONDecodeError as e:
            self.send_json(400, {"error": f"Invalid JSON: {str(e)}"})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_config_list(self):
        """List all config files."""
        config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')
        if not os.path.exists(config_dir):
            self.send_json(200, {"files": []})
            return
        files = [f for f in os.listdir(config_dir) if f.endswith('.json')]
        self.send_json(200, {"files": sorted(files)})

    def handle_rdf_import(self):
        """Fetch RDF from URL, parse DCAT datasets, return as JSON"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
        rdf_url = body.get('url', '')

        if not rdf_url:
            self.send_json(400, {"error": "URL required"})
            return

        try:
            import xml.etree.ElementTree as ET

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            # Follow redirects
            req = urllib.request.Request(rdf_url, headers={
                'Accept': 'application/rdf+xml, application/xml, text/xml, */*',
                'User-Agent': 'INSP-Dataspace-Connector/1.0'
            })
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                xml_content = resp.read()

            root = ET.fromstring(xml_content)

            # Common namespace variations
            NS_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
            NS_DCAT = 'http://www.w3.org/ns/dcat#'
            NS_DCT = 'http://purl.org/dc/terms/'
            NS_FOAF = 'http://xmlns.com/foaf/0.1/'

            datasets = []
            distributions_map = {}

            # First pass: collect all Distribution elements
            for desc in root.iter('{%s}Description' % NS_RDF):
                rdf_type = desc.find('{%s}type' % NS_RDF)
                about = desc.get('{%s}about' % NS_RDF, '')

                if rdf_type is not None and rdf_type.get('{%s}resource' % NS_RDF) == NS_DCAT + 'Distribution':
                    dist = {}
                    for child in desc:
                        tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
                        if tag == 'title': dist['title'] = child.text or ''
                        if tag == 'accessURL': dist['url'] = child.get('{%s}resource' % NS_RDF, '')
                        if tag == 'downloadURL': dist['downloadUrl'] = child.get('{%s}resource' % NS_RDF, '')
                        if tag == 'format': dist['format'] = child.text or ''
                        if tag == 'mediaType': dist['mediaType'] = child.text or ''
                    if not dist.get('url'): dist['url'] = dist.get('downloadUrl', '')
                    distributions_map[about] = dist

            # Also find dcat:Distribution direct elements
            for dist_el in root.iter('{%s}Distribution' % NS_DCAT):
                about = dist_el.get('{%s}about' % NS_RDF, '')
                dist = {}
                for child in dist_el:
                    tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
                    if tag == 'title': dist['title'] = child.text or ''
                    if tag == 'accessURL': dist['url'] = child.get('{%s}resource' % NS_RDF, '')
                    if tag == 'downloadURL': dist['downloadUrl'] = child.get('{%s}resource' % NS_RDF, '')
                    if tag == 'format': dist['format'] = child.text or ''
                distributions_map[about] = dist

            # Second pass: collect Dataset elements
            # Method 1: rdf:Description with rdf:type=dcat:Dataset
            for desc in root.iter('{%s}Description' % NS_RDF):
                rdf_type = desc.find('{%s}type' % NS_RDF)
                if rdf_type is not None and rdf_type.get('{%s}resource' % NS_RDF) == NS_DCAT + 'Dataset':
                    ds = self.parse_dataset_element(desc, NS_RDF, NS_DCT, NS_DCAT, NS_FOAF, distributions_map)
                    if ds.get('title'):
                        datasets.append(ds)

            # Method 2: direct dcat:Dataset elements
            for ds_el in root.iter('{%s}Dataset' % NS_DCAT):
                ds = self.parse_dataset_element(ds_el, NS_RDF, NS_DCT, NS_DCAT, NS_FOAF, distributions_map)
                if ds.get('title'):
                    datasets.append(ds)

            # Sort by title for consistent ordering across re-imports
            datasets.sort(key=lambda d: d.get('title', ''))

            self.send_json(200, {"datasets": datasets, "count": len(datasets), "source": rdf_url})

        except ET.ParseError as e:
            self.send_json(400, {"error": f"RDF inválido (não é XML válido): {str(e)}", "url": rdf_url})
        except urllib.error.HTTPError as e:
            self.send_json(e.code, {"error": f"HTTP {e.code}: {e.reason}", "url": rdf_url})
        except urllib.error.URLError as e:
            self.send_json(502, {"error": f"Não foi possível acessar a URL: {str(e.reason)}", "url": rdf_url})
        except Exception as e:
            self.send_json(500, {"error": f"{type(e).__name__}: {str(e)}", "url": rdf_url})

    def parse_dataset_element(self, elem, NS_RDF, NS_DCT, NS_DCAT, NS_FOAF, distributions_map):
        """Parse a dataset element (rdf:Description or dcat:Dataset) into a dict.
        
        Extracts ALL available fields including dcatbr: namespace properties
        so they can be mapped to the dcat-br-schema.json in the dashboard.
        """
        NS_DCATBR = 'http://www.w3.org/ns/dcat-br#'
        NS_DCATBR_ALT = 'https://www.gov.br/conecta/catalogo/dcat-br#'
        NS_DCATBR_PURL = 'http://purl.org/dcat-br/'
        NS_ADMS = 'http://www.w3.org/ns/adms#'

        ds = {}
        ds['id'] = elem.get('{%s}about' % NS_RDF, f'dataset-{id(elem)}')

        keywords = []
        themes = []
        dist_refs = []

        for child in elem:
            tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
            ns = child.tag.split('}')[0].strip('{') if '}' in child.tag else ''

            # === Standard DCAT / DCTerms fields ===
            if tag == 'title' and ns in (NS_DCT, NS_DCAT):
                if not ds.get('title'): ds['title'] = child.text or ''
            elif tag == 'description' and ns == NS_DCT:
                if not ds.get('description'): ds['description'] = child.text or ''
            elif tag == 'keyword' and ns == NS_DCAT:
                if child.text: keywords.append(child.text)
            elif tag == 'theme' and ns == NS_DCAT:
                ref = child.get('{%s}resource' % NS_RDF, '')
                if ref: themes.append(ref.split('/')[-1])
                elif child.text: themes.append(child.text)
            elif tag == 'creator' and ns == NS_DCT:
                org_el = child.find('{%s}Organization/{%s}name' % (NS_FOAF, NS_FOAF))
                if org_el is not None and org_el.text:
                    ds['creator'] = org_el.text
                else:
                    name_el = child.find('.//{%s}name' % NS_FOAF)
                    if name_el is not None and name_el.text:
                        ds['creator'] = name_el.text
                    else:
                        ds['creator'] = child.get('{%s}resource' % NS_RDF, child.text or '')
            elif tag == 'publisher' and ns == NS_DCT:
                org_el = child.find('{%s}Organization/{%s}name' % (NS_FOAF, NS_FOAF))
                if org_el is not None and org_el.text:
                    ds['publisher'] = org_el.text
                else:
                    name_el = child.find('.//{%s}name' % NS_FOAF)
                    if name_el is not None and name_el.text:
                        ds['publisher'] = name_el.text
                    else:
                        ds['publisher'] = child.get('{%s}resource' % NS_RDF, child.text or '')
                # Also use publisher as creator fallback
                if not ds.get('creator'):
                    ds['creator'] = ds['publisher']
            elif tag == 'accrualPeriodicity' and ns == NS_DCT:
                val = child.get('{%s}resource' % NS_RDF, child.text or '')
                ds['periodicity'] = val.split('/')[-1] if '/' in val else val
            elif tag == 'license' and ns in (NS_DCT, NS_DCAT):
                ds['license'] = child.get('{%s}resource' % NS_RDF, child.text or '')
            elif tag == 'language' and ns == NS_DCT:
                val = child.get('{%s}resource' % NS_RDF, child.text or '')
                ds['language'] = val.split('/')[-1] if '/' in val else val
            elif tag == 'spatial' and ns == NS_DCT:
                ds['spatial'] = child.get('{%s}resource' % NS_RDF, child.text or '')
            elif tag == 'spatialResolutionInMeters' and ns in (NS_DCT, NS_DCAT):
                ds['spatialResolutionInMeters'] = child.text or ''
                ds['granularidade'] = child.text or ''
            elif tag == 'accessRights' and ns == NS_DCT:
                ds['accessRights'] = child.get('{%s}resource' % NS_RDF, child.text or '')
            elif tag == 'contactPoint' and ns == NS_DCAT:
                vcard_email = child.find('.//{http://www.w3.org/2006/vcard/ns#}hasEmail')
                if vcard_email is not None:
                    ds['contactPoint'] = vcard_email.get('{%s}resource' % NS_RDF, vcard_email.text or '').replace('mailto:', '')
                else:
                    ds['contactPoint'] = child.get('{%s}resource' % NS_RDF, child.text or '')
            elif tag == 'temporal' and ns == NS_DCT:
                # Navigate into dcterms:PeriodOfTime > dcat:startDate / dcat:endDate
                period = child.find('{%s}PeriodOfTime' % NS_DCT)
                if period is None:
                    period = child.find('.//{%s}PeriodOfTime' % NS_DCT)
                if period is not None:
                    start_el = period.find('{%s}startDate' % NS_DCAT)
                    if start_el is None:
                        start_el = period.find('{%s}startDate' % NS_DCT)
                    end_el = period.find('{%s}endDate' % NS_DCAT)
                    if end_el is None:
                        end_el = period.find('{%s}endDate' % NS_DCT)
                    if start_el is not None and start_el.text:
                        ds['temporalStart'] = start_el.text
                    if end_el is not None and end_el.text:
                        ds['temporalEnd'] = end_el.text
                else:
                    val = child.get('{%s}resource' % NS_RDF, child.text or '')
                    if val:
                        ds['temporal'] = val
            elif tag == 'startDate' and ns in (NS_DCAT, NS_DCT):
                ds['temporalStart'] = child.text or ''
            elif tag == 'endDate' and ns in (NS_DCAT, NS_DCT):
                ds['temporalEnd'] = child.text or ''
            elif tag == 'version' and ns in (NS_DCAT, NS_DCT, NS_ADMS):
                ds['version'] = child.text or ''
            elif tag == 'created' and ns == NS_DCT:
                ds['created'] = child.text or ''
            elif tag == 'issued' and ns == NS_DCT:
                ds['issued'] = child.text or ''
            elif tag == 'modified' and ns == NS_DCT:
                ds['modified'] = child.text or ''

            # === DCAT-BR specific fields (all namespace variations) ===
            elif ns in (NS_DCATBR, NS_DCATBR_ALT, NS_DCATBR_PURL):
                val = child.get('{%s}resource' % NS_RDF, child.text or '')
                ds[f'dcatbr:{tag}'] = val

            # === Distribution references ===
            elif tag == 'distribution':
                ref = child.get('{%s}resource' % NS_RDF, '')
                if ref: dist_refs.append(ref)
                # Inline distribution
                for inline_dist in child.iter('{%s}Distribution' % NS_DCAT):
                    d = self._parse_distribution_inline(inline_dist, NS_RDF, NS_DCT, NS_DCAT)
                    if d: dist_refs.append(d)

        ds['keywords'] = keywords
        ds['themes'] = themes

        # Resolve distributions
        distributions = []
        for ref in dist_refs:
            if isinstance(ref, dict):
                distributions.append(ref)
            elif ref in distributions_map:
                distributions.append(distributions_map[ref])
        ds['distributions'] = distributions

        return ds

    def _parse_distribution_inline(self, dist_el, NS_RDF, NS_DCT, NS_DCAT):
        """Parse an inline dcat:Distribution element."""
        d = {}
        for dc in dist_el:
            dtag = dc.tag.split('}')[1] if '}' in dc.tag else dc.tag
            dns = dc.tag.split('}')[0].strip('{') if '}' in dc.tag else ''
            if dtag == 'title' and dns == NS_DCT:
                d['title'] = dc.text or ''
            elif dtag == 'description' and dns == NS_DCT:
                d['description'] = dc.text or ''
            elif dtag == 'accessURL' and dns == NS_DCAT:
                d['url'] = dc.get('{%s}resource' % NS_RDF, '')
            elif dtag == 'downloadURL' and dns == NS_DCAT:
                d['downloadUrl'] = dc.get('{%s}resource' % NS_RDF, '')
            elif dtag == 'format' and dns == NS_DCT:
                val = dc.get('{%s}resource' % NS_RDF, dc.text or '')
                # Extract readable format from IANA URL
                if 'iana.org' in val:
                    d['format'] = val.split('/')[-1] if '/' in val else val
                else:
                    d['format'] = val
            elif dtag == 'mediaType' and dns == NS_DCAT:
                d['mediaType'] = dc.get('{%s}resource' % NS_RDF, dc.text or '')
            elif dtag == 'byteSize' and dns == NS_DCAT:
                d['byteSize'] = dc.text or ''
            elif dtag == 'type' and dns == NS_DCT:
                val = dc.get('{%s}resource' % NS_RDF, dc.text or '')
                d['type'] = val.split('/')[-1] if '/' in val else val
        if not d.get('url'):
            d['url'] = d.get('downloadUrl', '')
        return d if d else None

    def send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        """Suppress default request logging (less noisy)."""
        pass

    @staticmethod
    def _guess_content_type(filepath):
        ext_map = {
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.html': 'text/html',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        }
        ext = os.path.splitext(filepath)[1].lower()
        return ext_map.get(ext, 'application/octet-stream')


def main():
    print("=" * 55)
    print(f"  INSP Dataspace — Dashboard Participante")
    print(f"  Connector: {PARTICIPANT_ID}")
    print("=" * 55)
    print()
    print(f"  Dashboard:   http://localhost:{DASHBOARD_PORT}")
    print(f"  Management:  {CONNECTOR_MGMT}/management/")
    print(f"  Health:      {CONNECTOR_HEALTH}/api/check/health")
    print(f"  Broker:      {BROKER_MGMT}")
    print()

    server = http.server.HTTPServer(('0.0.0.0', DASHBOARD_PORT), ParticipantHandler)
    print(f"  Servidor iniciado na porta {DASHBOARD_PORT}")
    print("  Ctrl+C para parar")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Parando dashboard...")
        server.shutdown()
        sys.exit(0)


if __name__ == '__main__':
    main()
