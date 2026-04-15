document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('processBtn');
    const templateBtn = document.getElementById('templateBtn');
    const importBtn = document.getElementById('importBtn');
    const inputText = document.getElementById('inputText');
    const datasetFile = document.getElementById('datasetFile');
    const outputSection = document.getElementById('outputSection');
    const datasetSection = document.getElementById('datasetSection');
    const datasetSummary = document.getElementById('datasetSummary');
    const summaryList = document.getElementById('summaryList');
    const jsonOutput = document.getElementById('jsonOutput');
    const rawOutput = document.getElementById('rawOutput');
    const loader = document.getElementById('loader');
    const btnText = processBtn.querySelector('.btn-text');

    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');

    // When running the frontend via npm dev server, call the FastAPI backend explicitly.
    const API_BASE_URL = window.location.port === '5173' ? ('http://' + window.location.hostname + ':8000') : '';
    const LOCALHOST_API_BASE_URL = window.location.port === '5173' ? 'http://127.0.0.1:8000' : '';

    const datasetTemplate = {
        train: [
            {
                id: 1,
                input_text: 'Draft a concise summary of the project kickoff notes.',
                expected_summary: [
                    'The meeting focused on the project kickoff and priorities.',
                    'Action items were assigned to the team.',
                    'Next steps were discussed for the upcoming sprint.'
                ],
                expected_structured_data: {
                    names: ['Team Alpha'],
                    dates: ['2026-04-15'],
                    locations: ['Virtual'],
                    keywords: ['kickoff', 'priorities', 'action items']
                }
            }
        ],
        validation: [
            {
                id: 2,
                input_text: 'Summarize the customer feedback email and extract entities.',
                expected_summary: [
                    'The email highlights customer feedback on the rollout.',
                    'Important issues and requests were mentioned.',
                    'The team should review the feedback before release.'
                ],
                expected_structured_data: {
                    names: ['Customer Success'],
                    dates: ['2026-04-16'],
                    locations: ['Remote'],
                    keywords: ['feedback', 'rollout', 'release']
                }
            }
        ],
        test: [
            {
                id: 3,
                input_text: 'Analyze the deployment checklist and extract the main action items.',
                expected_summary: [
                    'The checklist covers deployment preparation steps.',
                    'Validation and approval tasks are included.',
                    'Final deployment readiness is the goal.'
                ],
                expected_structured_data: {
                    names: ['DevOps Team'],
                    dates: ['2026-04-17'],
                    locations: ['Production'],
                    keywords: ['deployment', 'checklist', 'validation']
                }
            }
        ]
    };

    let currentStructuredData = null;

    processBtn.addEventListener('click', async () => {
        const text = inputText.value.trim();
        if (!text) {
            alert('Please enter some text to process.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetchApiWithFallback('/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            const data = await parseApiResponse(response, 'Failed to process text.');
            currentStructuredData = data.structured_data;
            displayResults(data);
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred: ' + buildFriendlyErrorMessage(error, 'process text'));
        } finally {
            setLoading(false);
        }
    });

    templateBtn.addEventListener('click', () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(datasetTemplate, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', 'prompting-for-task-automation-dataset-template.json');
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    importBtn.addEventListener('click', async () => {
        const selectedFile = datasetFile.files[0];
        if (!selectedFile) {
            alert('Please choose a JSON or CSV dataset file first.');
            return;
        }

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetchApiWithFallback('/dataset/import', {
                method: 'POST',
                body: formData
            });

            const data = await parseApiResponse(response, 'Failed to import dataset.');
            renderDatasetSummary(data.filename, data.summary);
        } catch (error) {
            console.error('Dataset import error:', error);
            alert('An error occurred: ' + buildFriendlyErrorMessage(error, 'import dataset'));
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = 'Import Dataset';
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (!currentStructuredData) {
            return;
        }

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentStructuredData, null, 4));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', 'extracted_data.json');
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    copyBtn.addEventListener('click', () => {
        const textToCopy = rawOutput.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span>Copied!</span> [ok]';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        });
    });

    function setLoading(isLoading) {
        if (isLoading) {
            processBtn.disabled = true;
            loader.style.display = 'block';
            btnText.style.opacity = '0.5';
            btnText.textContent = 'Analyzing with Gemini...';
            outputSection.classList.add('hidden');
        } else {
            processBtn.disabled = false;
            loader.style.display = 'none';
            btnText.style.opacity = '1';
            btnText.textContent = 'Process with Gemini AI';
        }
    }

    function displayResults(data) {
        summaryList.innerHTML = '';

        const points = Array.isArray(data.summary) ? data.summary : [data.summary];
        points.forEach((point) => {
            const li = document.createElement('li');
            li.textContent = point;
            summaryList.appendChild(li);
        });

        jsonOutput.textContent = JSON.stringify(data.structured_data, null, 4);
        rawOutput.textContent = data.raw_text;
        outputSection.classList.remove('hidden');

        setTimeout(() => {
            outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    function renderDatasetSummary(filename, summary) {
        const counts = summary.counts || {};
        const totalRecords = summary.total_records || 0;
        const samples = summary.samples || {};

        const formatSample = (records) => {
            if (!records || records.length === 0) {
                return '<em>No records</em>';
            }
            return '<pre>' + escapeHtml(JSON.stringify(records, null, 2)) + '</pre>';
        };

        datasetSummary.innerHTML =
            '<div class="dataset-meta">' +
            '<p><strong>File:</strong> ' + escapeHtml(filename) + '</p>' +
            '<p><strong>Total Records:</strong> ' + totalRecords + '</p>' +
            '</div>' +
            '<div class="dataset-grid">' +
            '<div class="dataset-card"><h4>Train</h4><p>' + (counts.train || 0) + ' records</p>' + formatSample(samples.train) + '</div>' +
            '<div class="dataset-card"><h4>Validation</h4><p>' + (counts.validation || 0) + ' records</p>' + formatSample(samples.validation) + '</div>' +
            '<div class="dataset-card"><h4>Test</h4><p>' + (counts.test || 0) + ' records</p>' + formatSample(samples.test) + '</div>' +
            '</div>';

        datasetSection.classList.remove('hidden');
        datasetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    async function parseApiResponse(response, defaultMessage) {
        const rawBody = await response.text();
        let parsed;

        if (rawBody) {
            try {
                parsed = JSON.parse(rawBody);
            } catch (error) {
                if (response.ok) {
                    throw new Error('Server returned an invalid JSON response.');
                }
            }
        }

        if (!response.ok) {
            const detail = parsed && (parsed.detail || parsed.message);
            if (detail) {
                throw new Error(detail);
            }
            if (rawBody && !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error(defaultMessage + ' Received non-JSON response from server.');
            }
            throw new Error(defaultMessage);
        }

        if (!parsed) {
            throw new Error('Server returned an empty response.');
        }

        return parsed;
    }

    async function fetchApiWithFallback(path, options) {
        const primaryUrl = API_BASE_URL + path;
        const shouldTryLocalhostFallback =
            Boolean(API_BASE_URL) &&
            API_BASE_URL !== LOCALHOST_API_BASE_URL &&
            window.location.hostname !== '127.0.0.1' &&
            window.location.hostname !== 'localhost';

        try {
            return await fetch(primaryUrl, options);
        } catch (primaryError) {
            if (!shouldTryLocalhostFallback) {
                throw primaryError;
            }

            return fetch(LOCALHOST_API_BASE_URL + path, options);
        }
    }

    function buildFriendlyErrorMessage(error, action) {
        const message = String(error && error.message ? error.message : error);

        if (message.includes('Failed to fetch')) {
            return (
                'Cannot reach backend API while trying to ' + action + '. ' +
                'Make sure FastAPI is running on http://' + window.location.hostname + ':8000.'
            );
        }

        if (message.includes('non-JSON response')) {
            return (
                'Backend returned an unexpected response while trying to ' + action + '. ' +
                'Check that the backend server is running and reachable on port 8000.'
            );
        }

        return message;
    }
});
